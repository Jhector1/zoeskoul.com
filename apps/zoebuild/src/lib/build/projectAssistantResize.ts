/** UI-only dimensions. Both sides can approach the frame edge, but the
 *  8px separator and a visible strip on each side stay available to recover. */
export const ZOE_CHAT_MIN_WIDTH = 72;
export const ZOE_STAGE_MIN_WIDTH = 72;
export const ZOE_CHAT_GRIP_WIDTH = 8;
export const ZOE_CHAT_DEFAULT_WIDTH = 400;
export const ZOE_CHAT_DESKTOP_MIN_WIDTH = 600;

export function zoeChatWidthLimit(frameWidth: number): number {
  const safeWidth = Number.isFinite(frameWidth) ? Math.max(0, Math.floor(frameWidth)) : 0;
  return Math.max(ZOE_CHAT_MIN_WIDTH,
    safeWidth - ZOE_STAGE_MIN_WIDTH - ZOE_CHAT_GRIP_WIDTH);
}

export function clampZoeChatWidth(requested: number, frameWidth: number): number {
  const width = Number.isFinite(requested) ? requested : ZOE_CHAT_DEFAULT_WIDTH;
  return Math.max(ZOE_CHAT_MIN_WIDTH,
    Math.min(zoeChatWidthLimit(frameWidth), Math.round(width)));
}
