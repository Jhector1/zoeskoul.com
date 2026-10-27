/**
 * Safe error categories for ZoeBuild's source-edit route. Never include
 * arbitrary model/provider exception messages or user source in diagnostics.
 * All diagnostic fields are controlled vocabulary suitable for SSE, JSON,
 * and sanitized server logs. Does not change billing, retries, or authorization.
 */
export type ZoeEditFailureStage =
  | "setup"
  | "transport_setup"
  | "agent_inspection"
  | "proposal_validation"
  | "build_verification";

export type ZoeEditFailureDiagnostic = Readonly<{
  stage: ZoeEditFailureStage;
  reason:
    | "PROVIDER_REQUEST_FAILED"
    | "BILLING_EXECUTION_FAILED"
    | "AGENT_RESPONSE_REJECTED"
    | "MODEL_RESPONSE_SYNTAX"
    | "SERVER_TYPE_FAILURE"
    | "REQUEST_ABORTED"
    | "UNKNOWN_GENERATION_FAILURE";
}>;

export function diagnoseZoeEditFailure(
  error: unknown,
  stage: ZoeEditFailureStage,
): ZoeEditFailureDiagnostic {
  const name = error instanceof Error ? error.name : "";
  const reason: ZoeEditFailureDiagnostic["reason"] =
    name === "ZoeBuildRequiredMeteringError" || name === "ZoeBuildBillingRegistryError"
      ? "BILLING_EXECUTION_FAILED"
    : name === "ZoeProjectAgentError"
      ? "AGENT_RESPONSE_REJECTED"
    : name === "SyntaxError"
      ? "MODEL_RESPONSE_SYNTAX"
    : name === "TypeError"
      ? "SERVER_TYPE_FAILURE"
    : name === "AbortError"
      ? "REQUEST_ABORTED"
    : name === "APIError" || name === "ApiError" || name === "FetchError" ||
      name === "TimeoutError" || name === "AxiosError"
      ? "PROVIDER_REQUEST_FAILED"
    : "UNKNOWN_GENERATION_FAILURE";
  return { stage, reason };
}
