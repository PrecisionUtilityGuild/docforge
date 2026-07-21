import { afterEach, beforeAll, expect, it, vi } from "vitest";
import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DocForgeMcpClient, defaultServerEntry } from "../src/forge/mcp-client.js";
import { getTemplateSample } from "../src/templates/registry.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_ENTRY = path.join(ROOT, "dist", "index.js");

let built = true;
let client: DocForgeMcpClient;

beforeAll(async () => {
  try {
    await access(SERVER_ENTRY);
  } catch {
    built = false;
  }
});

afterEach(async () => {
  if (client) await client.close();
  vi.unstubAllEnvs();
});

it("resolves the default MCP server entry to compiled dist from source tests", () => {
  expect(defaultServerEntry()).toBe(SERVER_ENTRY);
});

it("allows FORGE_MCP_SERVER_ENTRY to override the default server entry", () => {
  vi.stubEnv("FORGE_MCP_SERVER_ENTRY", "custom/server.js");
  expect(defaultServerEntry()).toBe(path.resolve("custom/server.js"));
});

it("reuses one child process across multiple calls (no per-call spawn)", async () => {
  if (!built) return;
  client = new DocForgeMcpClient(SERVER_ENTRY);
  const sample = (await getTemplateSample("executive_memo")) as Record<string, unknown>;

  const r1 = await client.createDocument({ template_id: "executive_memo", data: sample });
  expect(r1.status).toBe("created");
  const pid1 = client.childPid;
  expect(pid1).toBeTypeOf("number");

  const r2 = await client.createDocument({ template_id: "executive_memo", data: sample });
  expect(r2.status).toBe("created");
  // Same child served both calls — the whole point of the shared client.
  expect(client.childPid).toBe(pid1);
});

it("self-heals: respawns a fresh child after the current one dies", async () => {
  if (!built) return;
  client = new DocForgeMcpClient(SERVER_ENTRY);
  const sample = (await getTemplateSample("executive_memo")) as Record<string, unknown>;

  const r1 = await client.createDocument({ template_id: "executive_memo", data: sample });
  expect(r1.status).toBe("created");
  const deadPid = client.childPid!;

  // Simulate a crash of the MCP child.
  process.kill(deadPid, "SIGKILL");
  await new Promise((r) => setTimeout(r, 150));

  // Next call must transparently respawn and succeed on a new pid.
  const r2 = await client.createDocument({ template_id: "executive_memo", data: sample });
  expect(r2.status).toBe("created");
  expect(client.childPid).not.toBe(deadPid);
});
