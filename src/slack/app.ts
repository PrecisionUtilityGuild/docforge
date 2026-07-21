#!/usr/bin/env node
import { App, ExpressReceiver, LogLevel } from "@slack/bolt";
import { initService } from "../service.js";
import { closeSharedMcpClient } from "../forge/mcp-client.js";
import { buildHealthReport } from "../forge/health.js";
import { loadSlackConfig } from "./config.js";
import { registerListeners } from "./listeners/index.js";

async function main(): Promise<void> {
  const config = loadSlackConfig();

  await initService();

  const logLevel = config.logLevel === "debug" ? LogLevel.DEBUG : LogLevel.INFO;

  const app =
    config.mode === "socket"
      ? new App({
          token: config.botToken,
          appToken: config.appToken,
          socketMode: true,
          logLevel,
        })
      : (() => {
          const receiver = new ExpressReceiver({
            signingSecret: config.signingSecret!,
            endpoints: "/slack/events",
          });
          receiver.router.get("/health", (_req, res) => {
            // Structured health for the reviewer-period deploy: liveness plus
            // Typst pin, MCP child/breaker state, and recent compile success.
            // 200 even when "degraded" — the in-process fallback keeps serving;
            // degraded is a signal for a watcher, not a "down".
            res.status(200).json(buildHealthReport());
          });
          return new App({
            token: config.botToken,
            receiver,
            logLevel,
          });
        })();

  registerListeners(app);

  // Graceful shutdown: stop accepting events and tear down the shared MCP child
  // so the container stops cleanly instead of orphaning the subprocess.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.logger.info(`Received ${signal}, shutting down…`);
    try {
      await app.stop();
    } catch (err) {
      app.logger.error("error during app.stop()", err);
    }
    await closeSharedMcpClient().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  if (config.mode === "socket") {
    await app.start();
    app.logger.info("Forge is running (socket mode)");
  } else {
    await app.start(config.port);
    app.logger.info(`Forge is running (HTTP :${config.port}, GET /health)`);
  }
}

main().catch((err) => {
  console.error("Forge fatal:", err);
  process.exit(1);
});
