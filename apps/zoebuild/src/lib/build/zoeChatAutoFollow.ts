/** Pure scrolling policy. Browser layout/typing scroll events are not user
 * gestures. Only an explicit reader-up gesture pauses auto-follow; reader-down
 * restores it once close to the bottom. New chat submissions opt in separately.
 * Keep the policy independent of React and any window scrolling. */
export type ZoeChatViewport = Readonly<{
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}>;

export function isZoeChatNearBottom(view: ZoeChatViewport): boolean {
  const {scrollHeight, scrollTop, clientHeight} = view;
  if (![scrollHeight, scrollTop, clientHeight].every(Number.isFinite)) return false;
  return scrollHeight - scrollTop - clientHeight <= 64;
}

export function resolveZoeChatFollowState(
  viewport: ZoeChatViewport,
  alreadyFollowing: boolean,
  readerDirection: "up" | "down" | null,
): boolean {
  if (readerDirection === "up") return false;
  if (readerDirection === "down" && isZoeChatNearBottom(viewport)) return true;
  // Crucial: a code block getting taller must not turn off auto-follow.
  return alreadyFollowing;
}
