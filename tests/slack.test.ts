import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKFLOWS } from "../src/forge/workflows.js";
import { formatHelpMessage, SUMMARIZE_REPLY, buildReply } from "../src/slack/agent/prompts.js";
import { SUGGESTED_PROMPTS } from "../src/slack/listeners/assistant-thread.js";
import { routeIntent, stripBotMention } from "../src/slack/router.js";
import { loadSlackConfig } from "../src/slack/config.js";

describe("Forge Slack router", () => {
  it("strips bot mentions", () => {
    expect(stripBotMention("<@U123> help")).toBe("help");
  });

  it("routes help", () => {
    expect(routeIntent("<@U123> help").kind).toBe("help");
    expect(routeIntent("").kind).toBe("help");
  });

  it("routes summarize without PDF workflow", () => {
    const intent = routeIntent("@forge summarize this thread");
    expect(intent.kind).toBe("summarize");
    expect(buildReply(intent)).toBe(SUMMARIZE_REPLY);
    expect(buildReply(intent)).toMatch(/no pdf/i);
  });

  it("routes the core document workflows", () => {
    expect(routeIntent("proposal for Northstar").kind).toBe("workflow");
    expect(routeIntent("incident report from #incident-api-gateway").kind).toBe("workflow");
    expect(routeIntent("board pack for Q3 operating review").kind).toBe("workflow");
    expect(routeIntent("postmortem from yesterday").kind).toBe("workflow");
    expect(routeIntent("draft turn these notes into a PDF").kind).toBe("workflow");
  });

  it("routes imperative PDF requests to the draft workflow", () => {
    for (const text of ["make a pdf of this", "give me a PDF", "make a one pager about roadmap"]) {
      const intent = routeIntent(text);
      expect(intent).toMatchObject({ kind: "workflow", workflowId: "draft" });
    }
  });

  it("does not mistake a passing mention of 'pdf'/'page' for a draft request", () => {
    expect(routeIntent("what page is the error on").kind).toBe("unknown");
    expect(routeIntent("I read your message on page 3").kind).toBe("unknown");
    expect(routeIntent("the pdf is broken").kind).toBe("unknown");
  });

  it("help lists every workflow's example command and the approval promise", () => {
    const help = formatHelpMessage();
    for (const workflow of WORKFLOWS) {
      // Commands are shown without the @forge prefix in the menu.
      expect(help).toContain(workflow.exampleCommand.replace(/^@forge\s+/i, ""));
    }
    expect(help).toContain("summarize");
    expect(help).toContain("App Home");
    expect(help).toContain("New document");
    expect(help).toContain("Board / metrics pack");
    expect(help).toMatch(/approve/i);
    expect(help).not.toMatch(/\n{3,}/);
  });

  it("assistant suggested prompts lead with draft, then the curated workflows", () => {
    // Draft first, then the rest in WORKFLOWS order.
    expect(SUGGESTED_PROMPTS[0]).toEqual({
      title: "Draft PDF",
      message: "draft turn these notes into a PDF",
    });
    const titles = SUGGESTED_PROMPTS.map((p) => p.title);
    expect(titles).toEqual([
      "Draft PDF",
      "Sales proposal",
      "Incident report",
      "Board KPI pack",
      "Status report",
    ]);
  });
});

describe("Forge Slack config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires socket or HTTP credentials", () => {
    vi.unstubAllEnvs();
    expect(() => loadSlackConfig()).toThrow(/SLACK_BOT_TOKEN|SLACK_APP_TOKEN|SLACK_SIGNING_SECRET/);
  });

  it("loads socket mode when SLACK_APP_TOKEN is set", () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
    vi.stubEnv("SLACK_APP_TOKEN", "xapp-test");
    vi.stubEnv("SLACK_SIGNING_SECRET", "");
    const config = loadSlackConfig();
    expect(config.mode).toBe("socket");
    expect(config.appToken).toBe("xapp-test");
  });

  it("loads HTTP mode when signing secret is set without app token", () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test");
    vi.stubEnv("SLACK_APP_TOKEN", "");
    vi.stubEnv("SLACK_SIGNING_SECRET", "secret");
    const config = loadSlackConfig();
    expect(config.mode).toBe("http");
    expect(config.signingSecret).toBe("secret");
  });
});
