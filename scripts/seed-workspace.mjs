#!/usr/bin/env node
/**
 * Seed a Slack workspace with realistic Forge workflow context.
 *
 * Prereqs:
 *   1. Create channels: #incident-api-gateway, #sales-northstar, #team-eng (and optionally #general)
 *   2. /invite @Forge into each
 *   3. SLACK_BOT_TOKEN in .env
 *
 * Usage: npm run seed:workspace
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebClient } from "@slack/web-api";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const delayMs = Number(process.env.SEED_DELAY_MS ?? 400);

const INCIDENT_CHANNEL = process.env.SEED_INCIDENT_CHANNEL ?? "incident-api-gateway";
const SALES_CHANNEL = process.env.SEED_SALES_CHANNEL ?? "sales-northstar";
const STATUS_CHANNEL = process.env.SEED_STATUS_CHANNEL ?? "team-eng";
const GENERAL_CHANNEL = process.env.SEED_GENERAL_CHANNEL ?? "general";

export const INCIDENT_MESSAGES = [
  "PagerDuty: *SEV1* api-gateway error rate 5.2% (threshold 1%)",
  "@oncall: seeing 502s on checkout — opening bridge",
  "@sre: incident bridge in #incident-api-gateway — all hands",
  "Impact: ~12% of active sessions affected, auth latency spiking",
  "Root cause likely connection pool exhaustion after cache invalidation event",
  "Mitigation: rolling back last deploy (cache config change)",
  "Rollback deployed — error rate dropping, still elevated",
  "Errors under 0.5% — monitoring",
  "All clear — critical path restored. Total impact ~47 minutes.",
  "@eng-lead: Root cause confirmed: connection pool limits too low for post-invalidation burst. Follow-up in JIRA.",
];

export const SALES_MESSAGES = [
  "Kickoff with *Northstar Analytics* — ERP + analytics integration discovery.",
  "Jordan (Northstar): need inventory sync with Snowflake warehouse, near-real-time.",
  "They want custom KPI templates for ops leadership — not our default dashboards.",
  "SSO via Okta is mandatory before go-live.",
  "Timeline pressure: board wants something in ~10 weeks.",
  "Internal BI team needs training — they don't want a black box.",
  "Scope notes: API integration, KPI dashboards, admin training. No pricing in this channel yet.",
  "Next: solution engineering to draft proposal — @forge when ready.",
  "Open question: data residency — EU customer subset.",
  "Northstar IT will provide API credentials within 5 business days of kickoff.",
];

export const STATUS_MESSAGES = [
  "Weekly platform update: API gateway integration is delayed — waiting on partner sandbox certification.",
  "CI pipeline deployed to staging and on track for production next week.",
  "Dashboard analytics shipped; metrics parity is at 92%.",
  "Blocked on finance approval for the reserved instance commitment.",
  "Auth SSO endpoint failing in regression tests, critical to fix before enterprise pilot.",
  "Next steps: run the gateway cutover dry run on June 17.",
  "Plan to complete the SSO regression fix before Friday and confirm partner sandbox access.",
];

export const GENERAL_PIN = `*Forge workflow commands*
• \`@forge draft Weekly update: pipeline improved, onboarding risk remains, recommendation is a setup wizard.\`
• \`@forge proposal for Northstar\` — gather from #sales-northstar, paste pricing when asked
• \`@forge incident report from #incident-api-gateway\`
• DM @forge + attach CSV: \`board pack for Q3 operating review\` (sample: scripts/fixtures/board-pack.csv)
• \`@forge status for #team-eng\``;

export function boardPackCsvPath() {
  return path.join(ROOT, "scripts/fixtures/board-pack.csv");
}

export async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function findChannelId(client, name) {
  let cursor;
  do {
    const page = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    const hit = page.channels?.find((c) => c.name === name);
    if (hit?.id) return hit.id;
    cursor = page.response_metadata?.next_cursor;
  } while (cursor);
  return undefined;
}

export async function postMessages(client, channelId, channelName, messages) {
  console.log(`\n#${channelName} (${channelId}) — posting ${messages.length} messages…`);
  for (const text of messages) {
    await client.chat.postMessage({ channel: channelId, text });
    await sleep(delayMs);
  }
  console.log(`  done`);
}

export async function seedChannel(client, name, messages) {
  const id = await findChannelId(client, name);
  if (!id) {
    console.warn(`  SKIP #${name} — channel not found. Create it in Slack, then /invite @Forge`);
    return false;
  }
  try {
    await postMessages(client, id, name, messages);
    return true;
  } catch (err) {
    const data = err?.data;
    if (data?.error === "not_in_channel") {
      console.warn(`  SKIP #${name} — bot not in channel. Run: /invite @Forge`);
      return false;
    }
    throw err;
  }
}

export function formatTryCommands({ incidentChannel, statusChannel }) {
  return [
    `  @forge incident report from #${incidentChannel}`,
    "  @forge proposal for Northstar",
    `  @forge status for #${statusChannel}`,
    "  @forge draft Weekly update: pipeline improved, onboarding risk remains, recommendation is a setup wizard.",
    "  DM: attach board-pack.csv + @forge board pack for Q3 operating review",
  ];
}

async function main() {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    console.error("SLACK_BOT_TOKEN missing — add to .env");
    process.exit(1);
  }

  const client = new WebClient(token);

  console.log("Forge workspace seed");
  console.log("Bot auth test…");
  const auth = await client.auth.test();
  console.log(`  workspace: ${auth.team} | bot: ${auth.user}`);

  const incidentOk = await seedChannel(client, INCIDENT_CHANNEL, INCIDENT_MESSAGES);
  const salesOk = await seedChannel(client, SALES_CHANNEL, SALES_MESSAGES);
  const statusOk = await seedChannel(client, STATUS_CHANNEL, STATUS_MESSAGES);
  const generalId = await findChannelId(client, GENERAL_CHANNEL);
  if (generalId) {
    try {
      await client.chat.postMessage({ channel: generalId, text: GENERAL_PIN });
      console.log(`\n#${GENERAL_CHANNEL} — posted workflow commands (pin manually if you want)`);
    } catch {
      console.warn(`  SKIP #${GENERAL_CHANNEL} — invite @Forge or post commands yourself`);
    }
  }

  const csvPath = boardPackCsvPath();

  console.log("\n--- Seed summary ---");
  console.log(
    incidentOk ? `✓ #${INCIDENT_CHANNEL}` : `✗ #${INCIDENT_CHANNEL} (create + /invite @Forge)`,
  );
  console.log(salesOk ? `✓ #${SALES_CHANNEL}` : `✗ #${SALES_CHANNEL} (create + /invite @Forge)`);
  console.log(statusOk ? `✓ #${STATUS_CHANNEL}` : `✗ #${STATUS_CHANNEL} (create + /invite @Forge)`);
  console.log("\nBoard pack CSV (attach in DM):");
  console.log(csvPath);
  console.log("\nTry:");
  for (const command of formatTryCommands({
    incidentChannel: INCIDENT_CHANNEL,
    statusChannel: STATUS_CHANNEL,
  })) {
    console.log(command);
  }
  console.log("\nStart bot: npm run slack");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("seed failed:", err?.data?.error ?? err.message ?? err);
    process.exit(1);
  });
}
