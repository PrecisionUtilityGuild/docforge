import type { WebClient } from "@slack/web-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHomeView } from "../src/slack/agent/home.js";
import {
  parseDraftIntakeSubmission,
  buildDraftIntakeModal,
  DRAFT_INTAKE_CALLBACK,
} from "../src/slack/forms/draft-intake.js";
import {
  parseMetricsIntakeSubmission,
  buildMetricsIntakeModal,
  METRICS_INTAKE_CALLBACK,
} from "../src/slack/forms/metrics-intake.js";
import { decodeFormTarget, encodeFormTarget } from "../src/slack/forms/types.js";
import {
  buildOpenDraftFormBlocks,
  buildOpenMetricsFormBlocks,
} from "../src/slack/forms/prompts.js";
import { registerFormListeners } from "../src/slack/listeners/forms.js";
import { getPendingBoardPack, getPendingDraft } from "../src/slack/session.js";

type RegisteredHandler = (args: Record<string, unknown>) => Promise<void>;
const target = { channelId: "C1", threadTs: "123.456", userId: "U1" };

function createRegisteredFormApp(): {
  actions: Map<string, RegisteredHandler>;
  views: Map<string, RegisteredHandler>;
} {
  const actions = new Map<string, RegisteredHandler>();
  const views = new Map<string, RegisteredHandler>();
  registerFormListeners({
    action(actionId: string, handler: RegisteredHandler) {
      actions.set(actionId, handler);
    },
    view(callbackId: string, handler: RegisteredHandler) {
      views.set(callbackId, handler);
    },
  } as never);
  return { actions, views };
}

function createFormClient(): {
  client: WebClient;
  openedViews: Record<string, unknown>[];
  messages: Record<string, unknown>[];
} {
  const openedViews: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const client = {
    views: {
      open: vi.fn(async (args: Record<string, unknown>) => {
        openedViews.push(args);
        return { ok: true };
      }),
    },
    conversations: {
      open: vi.fn(async () => ({ ok: true, channel: { id: "D_FORGE" } })),
    },
    chat: {
      postMessage: vi.fn(async (args: Record<string, unknown>) => {
        messages.push(args);
        return { ok: true, ts: "1710000000.000100" };
      }),
    },
    assistant: {
      threads: {
        setTitle: vi.fn(async () => ({ ok: true })),
        setStatus: vi.fn(async () => ({ ok: true })),
      },
    },
  } as unknown as WebClient;
  return { client, openedViews, messages };
}

function viewState(values: Record<string, Record<string, unknown>>): Record<string, unknown> {
  return { private_metadata: encodeFormTarget(target), state: { values } };
}

function pendingIdFromBoardCard(message: Record<string, unknown>): string {
  return pendingIdFromCardAction(message, "board_confirm");
}

function pendingIdFromDraftCard(message: Record<string, unknown>): string {
  return pendingIdFromCardAction(message, "draft_confirm");
}

function pendingIdFromCardAction(message: Record<string, unknown>, actionId: string): string {
  const blocks = (message.blocks ?? []) as Array<{
    type: string;
    elements?: Array<{ action_id?: string; value?: string }>;
  }>;
  const button = blocks
    .flatMap((block) => block.elements ?? [])
    .find((element) => element.action_id === actionId);
  if (!button?.value) throw new Error(`${actionId} button missing`);
  return button.value;
}

describe("slack forms", () => {
  beforeEach(() => {
    vi.stubEnv("FORGE_CONFIRM_PREVIEW", "off");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips form reply targets", () => {
    const encoded = encodeFormTarget(target);
    expect(decodeFormTarget(encoded)).toEqual(target);
  });

  it("parses draft intake submission", () => {
    const parsed = parseDraftIntakeSubmission({
      template_block: {
        template_select: { selected_option: { value: "executive_memo" } },
      },
      notes_block: { notes_input: { value: "Weekly update notes" } },
    });
    expect(parsed).toEqual({ templateId: "executive_memo", notes: "Weekly update notes" });
  });

  it("parses metrics intake submission", () => {
    const parsed = parseMetricsIntakeSubmission({
      pack_block: { pack_select: { selected_option: { value: "monthly_metrics" } } },
      period_block: { period_input: { value: "2026-Q1" } },
      csv_block: { csv_input: { value: "metric,value\nARR,4.2" } },
      commentary_block: { commentary_input: { value: "Strong quarter" } },
    });
    expect(parsed.packKind).toBe("monthly_metrics");
    expect(parsed.period).toBe("2026-Q1");
    expect(parsed.csv).toContain("ARR");
    expect(parsed.commentary).toBe("Strong quarter");
  });

  it("builds draft modal with callback id", async () => {
    const view = await buildDraftIntakeModal(target);
    expect(view.callback_id).toBe(DRAFT_INTAKE_CALLBACK);
    expect(view.private_metadata).toBe(encodeFormTarget(target));
  });

  it("builds metrics modal with callback id", () => {
    const view = buildMetricsIntakeModal(target);
    expect(view.callback_id).toBe(METRICS_INTAKE_CALLBACK);
  });

  it("home view includes quick-start form buttons", () => {
    const home = buildHomeView();
    const actions = home.blocks?.find((b) => b.type === "actions");
    expect(actions?.type).toBe("actions");
    if (actions?.type === "actions") {
      const ids = actions.elements.map((el) => ("action_id" in el ? el.action_id : ""));
      expect(ids).toContain("forge_home_open_draft_form");
      expect(ids).toContain("forge_home_open_metrics_form");
    }
  });

  it("prompt blocks include open-form buttons", () => {
    const draftBlocks = buildOpenDraftFormBlocks(target);
    const metricsBlocks = buildOpenMetricsFormBlocks(target);
    expect(draftBlocks.some((b) => b.type === "actions")).toBe(true);
    expect(metricsBlocks.some((b) => b.type === "actions")).toBe(true);
  });

  it("opens App Home draft form with a DM-capable reply target", async () => {
    const { actions } = createRegisteredFormApp();
    const { client, openedViews } = createFormClient();
    const ack = vi.fn(async () => undefined);

    await actions.get("forge_home_open_draft_form")!({
      ack,
      client,
      body: {
        type: "block_actions",
        trigger_id: "TRIGGER_1",
        user: { id: "U_HOME" },
        actions: [{ type: "button" }],
      },
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(openedViews).toHaveLength(1);
    const opened = openedViews[0] as { view?: { private_metadata?: string } };
    expect(decodeFormTarget(opened.view?.private_metadata ?? "")).toEqual({
      userId: "U_HOME",
      channelId: "",
      threadTs: "",
    });
  });

  it("keeps malformed metrics CSV inside the modal", async () => {
    const { views } = createRegisteredFormApp();
    const { client, messages } = createFormClient();
    const ack = vi.fn(async () => undefined);

    await views.get(METRICS_INTAKE_CALLBACK)!({
      ack,
      client,
      logger: { error: vi.fn(), debug: vi.fn() },
      view: viewState({
        pack_block: { pack_select: { selected_option: { value: "kpi_report" } } },
        period_block: { period_input: { value: "2026-Q1" } },
        csv_block: { csv_input: { value: "metric\nARR" } },
        commentary_block: { commentary_input: { value: "Strong quarter" } },
      }),
    });

    expect(ack).toHaveBeenCalledWith({
      response_action: "errors",
      errors: { csv_block: "CSV needs at least `metric` and `value` columns." },
    });
    expect(messages).toHaveLength(0);
  });

  it("metrics modal submission posts a confirmable board pack", async () => {
    const { views } = createRegisteredFormApp();
    const { client, messages } = createFormClient();
    const ack = vi.fn(async () => undefined);

    await views.get(METRICS_INTAKE_CALLBACK)!({
      ack,
      client,
      logger: { error: vi.fn(), debug: vi.fn() },
      view: viewState({
        pack_block: { pack_select: { selected_option: { value: "kpi_report" } } },
        period_block: { period_input: { value: "2026-Q1" } },
        csv_block: {
          csv_input: { value: "metric,value,target,trend,unit\nARR,4.2,4.0,up,USD" },
        },
        commentary_block: { commentary_input: { value: "Strong quarter" } },
      }),
    });

    expect(ack).toHaveBeenCalledWith();
    const confirm = messages.find((message) => JSON.stringify(message).includes("board_confirm"));
    expect(confirm).toBeDefined();
    const pendingId = pendingIdFromBoardCard(confirm!);
    expect(getPendingBoardPack(pendingId)?.period).toBe("2026-Q1");
  });

  it("monthly metrics modal selection is not overridden by board wording", async () => {
    const { views } = createRegisteredFormApp();
    const { client, messages } = createFormClient();
    const ack = vi.fn(async () => undefined);

    await views.get(METRICS_INTAKE_CALLBACK)!({
      ack,
      client,
      logger: { error: vi.fn(), debug: vi.fn() },
      view: viewState({
        pack_block: { pack_select: { selected_option: { value: "monthly_metrics" } } },
        period_block: { period_input: { value: "2026-Q1" } },
        csv_block: {
          csv_input: { value: "metric,value,target,trend,unit\nRevenue,120,100,up,USD" },
        },
        commentary_block: {
          commentary_input: { value: "Board wants this in the monthly metrics packet." },
        },
      }),
    });

    expect(ack).toHaveBeenCalledWith();
    const confirm = messages.find((message) => JSON.stringify(message).includes("draft_confirm"));
    expect(confirm).toBeDefined();
    expect(JSON.stringify(confirm)).not.toContain("draft_retemplate");
    const pendingId = pendingIdFromDraftCard(confirm!);
    const pending = getPendingDraft(pendingId);
    expect(pending?.templateId).toBe("monthly_metrics");
    expect(pending?.filename).toBe("Monthly-Metrics-2026-Q1.pdf");
  });
});
