/** Visual reveal of a COMPLETE, already-received message; not provider token streaming.
 * Bounds keep long answers from trapping users in a long animation. */
export function nextZoeResponseTypingLength(current: number, total: number): number {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(current) || current < 0) {
    throw new Error("INVALID_TYPING_LENGTH");
  }
  const step = Math.max(1, Math.ceil(total / 120));
  return Math.min(total, current + step);
}
