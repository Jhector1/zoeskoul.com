export type MarketingConsentPromptState = {
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
  pathname: string | null;
  hasPreference: boolean | null;
};

export function shouldShowMarketingConsentPrompt(
  state: MarketingConsentPromptState,
) {
  if (state.sessionStatus !== "authenticated") return false;
  if (state.hasPreference !== false) return false;

  const pathname = state.pathname ?? "";
  return !/(^|\/)authenticate(?:\/|$)/.test(pathname);
}
