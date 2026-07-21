import type { Logger, SayArguments, SayStreamFn, SetStatusFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { SlackInputFile } from "./gather/board.js";

export type SayFn = (args: SayArguments) => Promise<unknown>;

export type ForgeMessageContext = {
  text: string;
  /** Where Forge replies (and uploads). */
  threadTs: string;
  replyChannelId: string;
  isDm: boolean;
  /** True when the triggering message is in a thread. */
  inThread: boolean;
  /** Parent thread timestamp when inThread is true. */
  threadParentTs?: string;
  files?: SlackInputFile[];
  actionToken?: string;
  say: SayFn;
  sayStream?: SayStreamFn;
  setStatus?: SetStatusFn;
  client: WebClient;
  logger: Logger;
};
