export type SlackMode = "socket" | "http";

export type SlackConfig = {
  mode: SlackMode;
  botToken: string;
  port: number;
  logLevel: "debug" | "info";
  appToken?: string;
  signingSecret?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parsePort(raw: string | undefined): number {
  const port = Number(raw ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw ?? ""}`);
  }
  return port;
}

function detectMode(): SlackMode {
  if (process.env.SLACK_SOCKET_MODE === "false") {
    return "http";
  }
  if (process.env.SLACK_APP_TOKEN || process.env.SLACK_SOCKET_MODE === "true") {
    return "socket";
  }
  if (process.env.SLACK_SIGNING_SECRET) {
    return "http";
  }
  throw new Error("Set SLACK_APP_TOKEN for socket mode, or SLACK_SIGNING_SECRET for HTTP mode.");
}

export function loadSlackConfig(): SlackConfig {
  const mode = detectMode();
  const botToken = requireEnv("SLACK_BOT_TOKEN");
  const port = parsePort(process.env.PORT);
  const logLevel = process.env.SLACK_LOG_LEVEL === "debug" ? "debug" : "info";

  if (mode === "socket") {
    return {
      mode,
      botToken,
      appToken: requireEnv("SLACK_APP_TOKEN"),
      port,
      logLevel,
    };
  }

  return {
    mode,
    botToken,
    signingSecret: requireEnv("SLACK_SIGNING_SECRET"),
    port,
    logLevel,
  };
}
