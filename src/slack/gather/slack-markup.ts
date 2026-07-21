/**
 * Slack message text carries `:shortcode:` emoji (`:warning:`, `:one:`) that
 * render fine in Slack but leak as literal text into exported PDFs. Strip them
 * for document content. We only remove well-formed shortcode tokens bounded by
 * whitespace/start/end so real prose like "ratio 3:2" or "time 16:10" survives.
 */
export function stripEmojiShortcodes(text: string): string {
  return text
    .replace(/(^|\s):[a-z0-9+-][a-z0-9_+-]*:(?=\s|$|[.,!?;])/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?;])/g, "$1")
    .trim();
}

/**
 * Strip Slack-specific markup from text before mappers run.
 * Converts link labels, channel refs, mentions, and emoji shortcodes into plain text.
 */
export function stripSlackMarkup(text: string): string {
  const stripLine = (line: string): string =>
    stripEmojiShortcodes(
      line
        // <https://url|label> or <url|label with spaces>
        .replace(/<([^|>@#][^>|]*)\|([^>]+)>/g, "$2")
        // bare URLs/channels without label
        .replace(/<(https?:\/\/[^>]+)>/g, "$1")
        // <#C123|channel-name> → #channel-name
        .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
        .replace(/<#[A-Z0-9]+>/g, "")
        // user/special mentions
        .replace(/<@[A-Z0-9]+>/g, "")
        .replace(/<![^>]+>/g, "")
        // leftover bold markers from pasted Slack text
        .replace(/\*/g, ""),
    );

  return text
    .split(/\r?\n/)
    .map((line) => stripLine(line).trim())
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
