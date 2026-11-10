/**
 * Learning admin labs are a separate execution trust boundary, not a bash
 * command allow-list. This stage intentionally cannot launch admin containers.
 * The launch path must remain fail-closed until an isolated executor and
 * trusted lesson entitlement have been connected and acceptance-tested.
 */
export type LearningLabMode = "standard" | "admin";

export type LearningLabRequestDecision =
  | Readonly<{ ok: true; mode: "standard" }>
  | Readonly<{ ok: false; status: 400 | 403 | 503; error: string }>;

/**
 * Browser-supplied fields are deliberately NEVER authority to elevate a lab.
 * Recognize rather than silently strip attempts at privilege selection so
 * teachers and students get an explicit status instead of a fake root shell.
 */
export function inspectLearningLabRequest(
  raw: unknown,
  adminLabsEnabled = process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED === "true",
): LearningLabRequestDecision {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: true, mode: "standard" };
  }
  const body = raw as Record<string, unknown>;
  const keys = ["labProfile", "privilegeMode", "executionProfile", "adminLab"] as const;
  const explicit = keys.filter((key) => Object.hasOwn(body, key));
  if (explicit.length === 0) return { ok: true, mode: "standard" };

  // Only the single canonical labProfile="standard" form is accepted from
  // an untrusted caller. Mixed aliases are rejected, including false adminLab.
  if (explicit.length !== 1 || explicit[0] !== "labProfile") {
    return { ok: false, status: 400, error: "Unsupported learning lab profile selection." };
  }
  if (body.labProfile === "standard") return { ok: true, mode: "standard" };
  if (body.labProfile !== "admin") {
    return { ok: false, status: 400, error: "Invalid learning lab profile." };
  }
  if (!adminLabsEnabled) {
    return { ok: false, status: 403, error: "Administrative learning labs are disabled." };
  }
  // An operator switch does not grant learner authorization, configure a
  // hardened admin image, or prove rootless daemon isolation. No fallback.
  return {
    ok: false,
    status: 503,
    error: "Administrative learning lab isolation is not configured.",
  };
}

/** Legacy records predate lab mode. Preserve their standard-only ownership. */
export function sessionLearningLabMode(
  storedMode: LearningLabMode | null | undefined,
): LearningLabMode {
  return storedMode === "admin" ? "admin" : "standard";
}
