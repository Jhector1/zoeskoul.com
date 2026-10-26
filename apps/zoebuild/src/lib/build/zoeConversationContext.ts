/** Bounded, ordered conversation context for the existing AI attempt journal.
 * We reuse its frozen previousInstructions string snapshot to preserve exact
 * retry identity. This is conversational context, not authority or storage.
 */
export type ZoeConversationTurn = Readonly<{role: "user" | "assistant"; text: string}>;
const MAX_TURNS = 6;
const MAX_TEXT = 820;

function boundedText(input: string): string {
  const text = input.trim();
  if (text.length <= MAX_TEXT) return text;
  // Keep the topic and the ending question/selection in long assistant replies.
  return text.slice(0, 490) + " … " + text.slice(-(MAX_TEXT - 493));
}

export function serializeZoeConversationHistory(
  turns: readonly ZoeConversationTurn[],
): string[] {
  return turns.filter(turn =>
    (turn.role === "user" || turn.role === "assistant") &&
    typeof turn.text === "string" && turn.text.trim().length > 0,
  ).slice(-MAX_TURNS).map(turn => {
    let text = boundedText(turn.text);
    let encoded = JSON.stringify({role: turn.role, text});
    // Escaped quotes/backslashes can expand JSON beyond the request limit.
    while (encoded.length > 1_000) {
      text = text.slice(0, Math.max(0, Math.floor(text.length * 0.8)));
      encoded = JSON.stringify({role: turn.role, text});
    }
    return encoded;
  });
}

export function deserializeZoeConversationHistory(value: readonly string[]): ZoeConversationTurn[] {
  return value.slice(-MAX_TURNS).map(entry => {
    // Existing in-flight attempts may contain the original plain user prompts.
    // They must remain replayable under the SAME billing operation identity.
    try {
      const candidate: unknown = JSON.parse(entry);
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        const turn = candidate as Record<string, unknown>;
        if ((turn.role === "user" || turn.role === "assistant") &&
            typeof turn.text === "string" && turn.text.length <= 850) {
          return {role: turn.role, text: turn.text};
        }
      }
    } catch { /* Original plain-text history. */ }
    return {role: "user" as const, text: entry};
  });
}
