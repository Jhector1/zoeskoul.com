export type ReviewSubmitFlush = () => Promise<boolean | void>;
export type ReviewSubmitGetter = () => unknown;

export type ReviewSubmitBridgeHost = {
  __zoeFlushWorkspaceBeforeSubmit?: Record<string, ReviewSubmitFlush>;
  __zoeFlushAnyWorkspaceBeforeSubmit?: ReviewSubmitFlush;
  __zoeGetWorkspaceBeforeSubmit?: Record<string, ReviewSubmitGetter>;
  __zoeGetAnyWorkspaceBeforeSubmit?: ReviewSubmitGetter;
  __zoeFlushTerminalBeforeSubmit?: Record<string, ReviewSubmitFlush>;
  __zoeFlushAnyTerminalBeforeSubmit?: ReviewSubmitFlush;
  __zoeGetTerminalEvidenceBeforeSubmit?: Record<string, ReviewSubmitGetter>;
  __zoeGetAnyTerminalEvidenceBeforeSubmit?: ReviewSubmitGetter;
};

export function getReviewSubmitBridgeHost(): ReviewSubmitBridgeHost | null {
  if (typeof window === "undefined") return null;
  return window as typeof window & ReviewSubmitBridgeHost;
}
