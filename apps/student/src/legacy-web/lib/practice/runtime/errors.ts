export type PracticeRequestErrorLike = {
  status?: unknown;
  message?: unknown;
};

/**
 * A signed practice key authorizes one generated exercise for a short window.
 * Expiry is recoverable because the active session can issue a fresh key for
 * the same open exercise without replacing learner-owned workspace state.
 */
export function isRecoverablePracticeKeyError(error: unknown) {
  const candidate = (error ?? {}) as PracticeRequestErrorLike;
  const status = Number(candidate.status);
  const message = String(candidate.message ?? "").toLowerCase();

  return (
    status === 401 ||
    message.includes("invalid or expired key") ||
    message.includes("practice validate failed (401)") ||
    message.includes("practice help failed (401)")
  );
}
