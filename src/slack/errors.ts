type SlackApiErrorData = {
  error?: string;
  needed?: string;
};

export function formatSlackApiError(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: SlackApiErrorData }).data;
    if (data?.error === "missing_scope" && data.needed) {
      return (
        `missing_scope — add bot scope \`${data.needed}\` in api.slack.com → OAuth & Permissions, ` +
        "then **Reinstall to Workspace** and restart `npm run slack`."
      );
    }
    if (data?.error) {
      return data.error;
    }
  }
  return err instanceof Error ? err.message : String(err);
}
