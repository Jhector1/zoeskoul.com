/** Safe, bounded intent diagnostics: DO NOT log provider messages or user text. */
export type ZoeIntentFailurePhase =
  "project" | "transport_setup" | "model_request" | "response_validation";

export function diagnoseZoeIntentFailure(
  error: unknown,
  phase: ZoeIntentFailurePhase,
): Readonly<{phase: ZoeIntentFailurePhase; category: string}> {
  const data = error && typeof error === "object"
    ? error as {name?: unknown; message?: unknown; code?: unknown} : {};
  const name = typeof data.name === "string" ? data.name : "";
  const message = typeof data.message === "string" ? data.message : "";
  const code = typeof data.code === "string" ? data.code : "";
  if (phase === "response_validation" && message === "BUILD_INTENT_INVALID")
    return {phase, category: "MODEL_REPLY_CONTRACT_INVALID"};
  if (phase === "response_validation")
    return {phase, category: "MODEL_REPLY_JSON_INVALID"};
  if (name === "MeteredAiJsonError") {
    // Metering errors are server-owned codes; do not expose their causes.
    if (/^AI_METERING_[A-Z0-9_]{1,85}$/.test(code)) return {phase, category: code};
    return {phase, category: "METERED_REQUEST_FAILED"};
  }
  if (message === "OpenAI returned no text content")
    return {phase, category: "MODEL_OUTPUT_EMPTY"};
  if (message === "AI_JSON_STREAM_INCOMPLETE" || message === "AI_JSON_STREAM_NO_COMPLETION")
    return {phase, category: "MODEL_OUTPUT_INCOMPLETE"};
  // Whitelist HTTP status only. Never log the provider-supplied error body.
  const status = /^OpenAI Responses API request failed \(([1-5][0-9][0-9])\)[.:]/.exec(message);
  if (status) return {phase, category: `MODEL_HTTP_${status[1]}`};
  if (message === "BUILD_AI_NOT_CONFIGURED" || message === "Missing OPENAI_API_KEY")
    return {phase, category: "MODEL_NOT_CONFIGURED"};
  if (name === "TypeError" && phase === "model_request")
    return {phase, category: "MODEL_NETWORK_FAILURE"};
  return {phase, category: "UNCLASSIFIED_FAILURE"};
}
