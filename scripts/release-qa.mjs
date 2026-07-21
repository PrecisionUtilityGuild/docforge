#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const gates = [
  ["Typst pin", "node", ["scripts/check-typst-version.mjs"]],
  ["Template schema/sample sync", "node", ["scripts/check-template-sync.mjs"]],
  ["Vendored Typst packages", "node", ["scripts/check-vendored-packages.mjs"]],
  ["Lint", "npm", ["run", "lint"]],
  ["Script syntax", "npm", ["run", "check:scripts"]],
  ["Format", "npm", ["run", "format:check"]],
  ["Build", "npm", ["run", "build"]],
  ["Tests", "npm", ["test"]],
  ["Forge smoke", "npm", ["run", "forge:smoke"]],
  ["Visual regression", "npm", ["run", "test:visual"]],
];

const requiredPackageFiles = [
  ".env.sample",
  "Dockerfile",
  "slack/manifest.json",
  "slack/manifest.http.json",
  "scripts/forge-smoke.mjs",
  "scripts/fixtures/board-pack.csv",
  "scripts/poll-slack.mjs",
  "scripts/release-qa.mjs",
  "scripts/seed-workspace.mjs",
  "scripts/visual-regression.mjs",
  "dist/slack/app.js",
  "dist/index.js",
];

const requiredScopes = [
  "app_mentions:read",
  "assistant:write",
  "channels:history",
  "channels:read",
  "chat:write",
  "files:read",
  "files:write",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "im:write",
  "mpim:history",
  "search:read.public",
  "users:read",
];

const requiredEvents = [
  "app_home_opened",
  "app_mention",
  "assistant_thread_started",
  "message.channels",
  "message.groups",
  "message.im",
  "message.mpim",
];

function npmCachePath() {
  return (
    process.env.DOCFORGE_NPM_CACHE ?? path.join(process.env.TMPDIR ?? "/tmp", "docforge-npm-cache")
  );
}

function runGate([label, command, args]) {
  console.log(`\n== ${label} ==`);
  const cachePath = npmCachePath();
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      npm_config_cache: cachePath,
      NPM_CONFIG_CACHE: cachePath,
    },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status ?? "signal"}`);
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(path.join(root, file), "utf8"));
}

function requireIncludes(actual, expected, label) {
  const missing = expected.filter((item) => !actual.includes(item));
  if (missing.length) throw new Error(`${label} missing: ${missing.join(", ")}`);
}

function checkManifest(file, expectedSocketMode) {
  const manifest = readJson(file);
  const scopes = manifest.oauth_config?.scopes?.bot ?? [];
  const events = manifest.settings?.event_subscriptions?.bot_events ?? [];
  requireIncludes(scopes, requiredScopes, `${file} bot scopes`);
  requireIncludes(events, requiredEvents, `${file} bot events`);
  if (manifest.settings?.socket_mode_enabled !== expectedSocketMode) {
    throw new Error(`${file} socket_mode_enabled must be ${expectedSocketMode}`);
  }
  if (manifest.settings?.interactivity?.is_enabled !== true) {
    throw new Error(`${file} interactivity must be enabled`);
  }
  const description = manifest.features?.assistant_view?.assistant_description ?? "";
  if (description.trim().split(/\s+/).filter(Boolean).length > 25) {
    throw new Error(`${file} assistant description exceeds 25 words`);
  }
}

function checkPackageContents() {
  console.log("\n== Package inventory ==");
  const cachePath = npmCachePath();
  const env = {
    ...process.env,
    npm_config_cache: cachePath,
    NPM_CONFIG_CACHE: cachePath,
  };
  const out = execFileSync("npm", ["--cache", cachePath, "pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  const pkg = JSON.parse(out)[0];
  const files = pkg.files.map((file) => file.path);
  requireIncludes(files, requiredPackageFiles, "package");
  console.log(
    `OK package includes ${requiredPackageFiles.length} release-critical files (${pkg.entryCount} total entries).`,
  );
}

function checkSecretPatterns() {
  console.log("\n== Secret pattern scan ==");
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root });
  const files = tracked
    .toString("utf8")
    .split("\0")
    .filter((file) => file && !file.startsWith("dist/"));
  const patterns = [
    ["Slack bot token", /xox[baprs]-[A-Za-z0-9-]{20,}/],
    ["Slack app token", /xapp-[A-Za-z0-9-]{20,}/],
    ["OpenAI API key", /sk-[A-Za-z0-9_-]{20,}/],
    ["GitHub token", /ghp_[A-Za-z0-9]{20,}/],
  ];
  const hits = [];
  for (const file of files) {
    const text = readFileSync(path.join(root, file), "utf8");
    for (const [label, pattern] of patterns) {
      if (pattern.test(text)) hits.push(`${label} in ${file}`);
    }
  }
  if (hits.length) throw new Error(`Potential secrets found:\n${hits.join("\n")}`);
  console.log(`OK scanned ${files.length} tracked files for common token patterns.`);
}

try {
  for (const gate of gates) runGate(gate);

  console.log("\n== Slack manifests ==");
  checkManifest("slack/manifest.json", true);
  checkManifest("slack/manifest.http.json", false);
  console.log("OK Slack manifests include required scopes, events, assistant, and interactivity.");

  checkPackageContents();
  checkSecretPatterns();
  console.log("\nRelease QA passed.");
} catch (err) {
  console.error(`\nRelease QA failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
