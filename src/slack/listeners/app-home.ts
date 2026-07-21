import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { buildHomeView } from "../agent/home.js";

type AppHomeOpenedArgs = AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_home_opened">;

/** Publish the Forge home tab when a user opens it. */
export async function handleAppHomeOpened({
  client,
  event,
  logger,
}: AppHomeOpenedArgs): Promise<void> {
  // app_home_opened fires for the messages tab too; only publish for the home tab.
  if (event.tab !== "home") return;
  try {
    await client.views.publish({ user_id: event.user, view: buildHomeView() });
  } catch (err) {
    logger.error("app_home_opened publish failed", err);
  }
}
