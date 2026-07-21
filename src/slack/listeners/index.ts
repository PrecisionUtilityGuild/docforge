import type { App } from "@slack/bolt";
import { dedupeRedeliveries } from "../middleware/dedupe.js";
import { registerActionListeners } from "./actions.js";
import { handleAppHomeOpened } from "./app-home.js";
import { handleAppMention } from "./app-mention.js";
import { handleAssistantThreadStarted } from "./assistant-thread.js";
import { registerFormListeners } from "./forms.js";
import { handleMessage } from "./message.js";

export function registerListeners(app: App): void {
  // Global guard: drop Slack event redeliveries before any listener runs,
  // so a retry cannot trigger a second (duplicate-PDF) workflow.
  app.use(dedupeRedeliveries);

  app.event("app_mention", handleAppMention);
  app.message(handleMessage);
  app.event("assistant_thread_started", handleAssistantThreadStarted);
  app.event("app_home_opened", handleAppHomeOpened);
  registerActionListeners(app);
  registerFormListeners(app);
}
