export type BrowserPreviewRunnerFailure = Readonly<{
  status: 409 | 429 | 502 | 503;
  code: "BUILD_PREVIEW_NEWER_OPERATION" | "BUILD_PREVIEW_SOURCE_CONFLICT" |
    "BUILD_PREVIEW_CAPACITY" | "BUILD_PREVIEW_RUNNER_UNAVAILABLE";
  conflictCategory?: "active_newer_operation" | "runner_source_conflict";
  message: string;
}>;

/** Stable browser contract for service-authenticated Runner failures. HTTP 409
 * alone never selects browser behavior; the verified Runner code does. */
export function classifyPreviewRunnerFailure(input: Readonly<{
  status:number;
  code?:string;
}>): BrowserPreviewRunnerFailure {
  if (input.status === 409 && input.code === "PREVIEW_NEWER_OPERATION") return {
    status:409,code:"BUILD_PREVIEW_NEWER_OPERATION",conflictCategory:"active_newer_operation",
    message:"A newer preview source is selected. Refresh the project.",
  };
  if (input.status === 409) return {
    status:409,code:"BUILD_PREVIEW_SOURCE_CONFLICT",conflictCategory:"runner_source_conflict",
    message:"A newer preview source is selected. Refresh the project.",
  };
  if (input.status === 429) return {
    status:429,code:"BUILD_PREVIEW_CAPACITY",
    message:"Preview capacity reached; retry when a session is free.",
  };
  return {
    status:input.status === 503 ? 503 : 502,code:"BUILD_PREVIEW_RUNNER_UNAVAILABLE",
    message:"Preview runner is unavailable. Retry after checking the runner service.",
  };
}
