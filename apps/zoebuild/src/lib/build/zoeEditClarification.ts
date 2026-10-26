/** Present a semantic no-change outcome as a question, never as a source edit. */
export function makeZoeEditClarification(summary: unknown): string {
  if (typeof summary === "string") {
    const text = summary.trim().replace(/\s+/g, " ");
    // We only surface a direct question; do not mistake a generic model summary
    // or a validation error for a helpful clarification.
    if (text.length >= 10 && text.length <= 420 && text.endsWith("?")) return text;
  }
  return "What specific part of the current project would you like to change, and how should it look or behave? No files were changed.";
}
