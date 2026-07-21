import { buildReply } from "./agent/prompts.js";
import { formatSlackApiError } from "./errors.js";
import type { WorkflowId } from "../forge/workflows.js";
import { routeIntent } from "./router.js";
import type { ForgeMessageContext } from "./types.js";
import { runBoardWorkflow } from "./workflows/board.js";
import { runDraftWorkflow } from "./workflows/draft.js";
import { runIncidentWorkflow } from "./workflows/incident.js";
import { runProposalWorkflow } from "./workflows/proposal.js";
import { runStatusWorkflow } from "./workflows/status.js";
import { runBrandWorkflow } from "./workflows/brand.js";
import { runDocumentWorkflow } from "./workflows/document.js";
import { runDetailsWorkflow } from "./workflows/details.js";
import { runTemplateStudioWorkflow } from "./workflows/template-studio.js";
import {
  looksLikePricingMessage,
  tryProposalPricingFollowUp,
} from "./workflows/proposal-followup.js";

type WorkflowRunner = {
  run: (ctx: ForgeMessageContext, rawText: string) => Promise<void>;
  /** Noun for the "I couldn't finish the …" failure message. */
  failureLabel: string;
};

const WORKFLOW_RUNNERS: Record<WorkflowId, WorkflowRunner> = {
  incident: { run: runIncidentWorkflow, failureLabel: "incident report" },
  proposal: { run: runProposalWorkflow, failureLabel: "proposal" },
  board: { run: runBoardWorkflow, failureLabel: "board pack" },
  draft: { run: runDraftWorkflow, failureLabel: "draft PDF" },
  status: { run: runStatusWorkflow, failureLabel: "status report" },
};

export async function handleForgeMessage(ctx: ForgeMessageContext): Promise<void> {
  if (await tryProposalPricingFollowUp(ctx)) return;

  const intent = routeIntent(ctx.text);

  switch (intent.kind) {
    case "help":
    case "summarize":
      await ctx.say({ text: buildReply(intent), thread_ts: ctx.threadTs });
      return;
    case "details":
      try {
        await runDetailsWorkflow(ctx);
      } catch (err) {
        ctx.logger.error("details workflow failed", err);
        await ctx.say({
          text: `Could not load build details: ${formatSlackApiError(err)}`,
          thread_ts: ctx.threadTs,
        });
      }
      return;
    case "document":
      try {
        await runDocumentWorkflow(ctx, intent.rawText);
      } catch (err) {
        ctx.logger.error("document workflow failed", err);
        await ctx.say({
          text: `Document workflow failed: ${formatSlackApiError(err)}`,
          thread_ts: ctx.threadTs,
        });
      }
      return;
    case "brand":
      try {
        await runBrandWorkflow(ctx, intent.rawText);
      } catch (err) {
        ctx.logger.error("brand workflow failed", err);
        await ctx.say({
          text: `Brand setup failed: ${formatSlackApiError(err)}`,
          thread_ts: ctx.threadTs,
        });
      }
      return;
    case "template":
      try {
        await runTemplateStudioWorkflow(ctx, intent.rawText);
      } catch (err) {
        ctx.logger.error("template studio failed", err);
        await ctx.say({
          text: `Template studio failed: ${formatSlackApiError(err)}`,
          thread_ts: ctx.threadTs,
        });
      }
      return;
    case "unknown":
      if (looksLikePricingMessage(ctx.text)) {
        await ctx.say({
          text:
            "That looks like pricing, but I don't have an open proposal in this thread. " +
            "Run `@forge proposal for Northstar` first, then paste pricing *in that same thread* " +
            "(use Reply, not a new channel message).",
          thread_ts: ctx.threadTs,
        });
        return;
      }
      await ctx.say({ text: buildReply(intent), thread_ts: ctx.threadTs });
      return;
    case "workflow": {
      const runner = WORKFLOW_RUNNERS[intent.workflowId];
      try {
        await runner.run(ctx, intent.rawText);
      } catch (err) {
        ctx.logger.error(`${intent.workflowId} workflow failed`, err);
        await ctx.say({
          text: `I couldn't finish the ${runner.failureLabel}. ${formatSlackApiError(err)}`,
          thread_ts: ctx.threadTs,
        });
      }
      return;
    }
  }
}
