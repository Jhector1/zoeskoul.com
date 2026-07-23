import type { ModuleAccessDecision } from "./resolveModuleAccess";

export type ModuleAccessDenial = {
  kind: "auth" | "assignment" | "billing";
  status: 401 | 402 | 403;
  code: "AUTH_REQUIRED" | "COURSE_ASSIGNMENT_REQUIRED" | "MODULE_ACCESS_REQUIRED";
  message: string;
};

/**
 * Converts the shared access decision into user-facing behavior. Billing,
 * assignment delivery, and API routes all consume this instead of inventing
 * different messages for the same denial reason.
 */
export function describeModuleAccessDenial(
  decision: Exclude<ModuleAccessDecision, { ok: true }>,
): ModuleAccessDenial {
  if (decision.reason === "requires_assignment") {
    return {
      kind: "assignment",
      status: 403,
      code: "COURSE_ASSIGNMENT_REQUIRED",
      message: "This private course must be assigned to you by an instructor.",
    };
  }

  if (decision.reason === "requires_login" && !decision.paid) {
    return {
      kind: "auth",
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Sign in to open this private course.",
    };
  }

  return {
    kind: "billing",
    status: 402,
    code: "MODULE_ACCESS_REQUIRED",
    message:
      decision.reason === "requires_login"
        ? "Sign in to subscribe and unlock this module."
        : "This module requires payment.",
  };
}
