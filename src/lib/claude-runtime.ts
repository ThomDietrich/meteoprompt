import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Anthropic runtime for the narrative calls (server-only).
 *
 * `MODEL` is the single source of truth for the model id used by the tool-use
 * derivation (claude.ts) and both narrative generators (summary.ts, overview.ts).
 * `runClaudeText` encapsulates the byte-identical "one system + one user message
 * → collapsed plain-text, error → null" call that summary.ts and overview.ts each
 * had inline.
 */

/** The model for all Claude calls in this app (spec-02 §6 / spec-06 decision 1). */
export const MODEL = "claude-sonnet-4-6";

/**
 * Run a single text completion: `system` + one `user` message, capped at
 * `maxTokens`. Collects the response's TextBlocks, joins them, collapses runs of
 * whitespace to single spaces and trims. Returns the text, or `null` when the
 * output is empty OR the call throws (best-effort — the caller renders fine
 * without it). `scope` is the log prefix used on failure (e.g. "summary").
 */
export async function runClaudeText(
  system: string,
  userContent: string,
  maxTokens: number,
  scope: string,
): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 0 ? text : null;
  } catch (error) {
    console.error(
      `[${scope}] generation failed:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
