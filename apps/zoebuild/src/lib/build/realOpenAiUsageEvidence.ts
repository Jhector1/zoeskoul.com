import { createHash, randomUUID } from "node:crypto";
import { createOpenAiJsonTransport, type AiJsonRequest, type AiJsonTextResult, type AiJsonTransport } from "@zoeskoul/ai-json";

/** Real provider smoke evidence only. No customer wallet, credits or price approval. */
export const REAL_PROVIDER_OUTPUT_TOKEN_CAP = 256;
export const REAL_PROVIDER_INPUT_TOKEN_CAP = 512;
export const REAL_PROVIDER_GLOBAL_ENDPOINT = "https://api.openai.com/v1";

export class ZoeRealProviderEvidenceError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ZoeRealProviderEvidenceError"; }
}

const probeRequest: AiJsonRequest = Object.freeze({
  system: "Return exactly the requested small JSON object. Do not include markdown or explanations.",
  user: "Produce the two required JSON fields for the ZoeBuild provider usage acceptance check.",
  schemaName: "ZoeBuildProviderUsageProbe",
  responseJsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      ok: {type: "boolean", enum: [true]},
      probe: {type: "string", enum: ["zoebuild-v12j11a"]},
    },
    required: ["ok", "probe"],
  },
  serviceTier: "default",
  maxOutputTokens: REAL_PROVIDER_OUTPUT_TOKEN_CAP,
});

export type RealProviderEvidence = Readonly<{
  model: string;
  preflightInputTokens: number;
  billedInputTokens: number;
  billedOutputTokens: number;
  cachedInputTokens: number | null;
  reasoningOutputTokens: number | null;
  responseIdDigest: string;
  providerHttpRequestIdPresent: boolean;
  actualServiceTier: string;
}>;

export function validateRealProviderProbeConfig(input: Readonly<{
  provider?: string; model?: string; approvedModel?: string;
  apiKey?: string; approval?: string; runtimeNodeEnv?: string; creditsEnforcement?: string;
}>): {model:string} {
  if (input.approval !== "V12J11A_SINGLE_REAL_REQUEST_APPROVED")
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_EXPLICIT_APPROVAL_REQUIRED");
  if (input.runtimeNodeEnv === "production" || input.creditsEnforcement === "required")
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_TEST_ISOLATION_REQUIRED");
  if (input.provider !== "openai")
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_OPENAI_ONLY");
  const model=input.model?.trim();
  if (!model || model !== input.approvedModel?.trim() || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,100}$/.test(model))
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_EXACT_MODEL_APPROVAL_REQUIRED");
  if (!input.apiKey?.trim())
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_API_KEY_REQUIRED");
  return {model};
}

export async function gatherOpenAiProviderEvidence(input: Readonly<{
  model: string; transport: AiJsonTransport;
}>): Promise<RealProviderEvidence> {
  if (input.transport.providerId !== "openai" || input.transport.model !== input.model ||
      input.transport.billingEndpointBaseUrl !== REAL_PROVIDER_GLOBAL_ENDPOINT ||
      typeof input.transport.countInputTokens !== "function")
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_TRANSPORT_UNVERIFIED");
  const counted=await input.transport.countInputTokens(probeRequest);
  if (!Number.isSafeInteger(counted) || counted < 1 || counted > REAL_PROVIDER_INPUT_TOKEN_CAP)
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_INPUT_COUNT_OVER_CAP");
  // At most one paid generation request. No retry on network/provider uncertainty.
  const result=await input.transport.generateJsonText({
    ...probeRequest, clientRequestId:`zb-v12j11a-${randomUUID()}`,
  });
  return validateActualProviderUsage({result,model:input.model,counted});
}

export function validateActualProviderUsage(input: Readonly<{
  result: AiJsonTextResult; model: string; counted: number;
}>): RealProviderEvidence {
  const {result,model,counted}=input;
  const u=result.usage;
  const m=result.metadata;
  if (!u || u.provider !== "openai" || m.provider !== "openai" || m.model !== model ||
      m.serviceTier !== "default" || !m.providerResponseId ||
      typeof m.providerResponseId !== "string")
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_USAGE_OR_TIER_UNVERIFIED");
  const valid = (n:unknown,cap:number)=>typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= cap;
  if (!valid(u.inputTokens,REAL_PROVIDER_INPUT_TOKEN_CAP) ||
      !valid(u.outputTokens,REAL_PROVIDER_OUTPUT_TOKEN_CAP) ||
      u.inputTokens + u.outputTokens < 1 ||
      (u.cachedInputTokens !== null && !valid(u.cachedInputTokens,u.inputTokens)) ||
      (u.reasoningOutputTokens !== null && !valid(u.reasoningOutputTokens,u.outputTokens)))
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_BILLABLE_TOKEN_CAP_EXCEEDED");
  let parsed:unknown;
  try { parsed=JSON.parse(result.text); } catch {
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_STRUCTURED_OUTPUT_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      Reflect.ownKeys(parsed).length !== 2 ||
      (parsed as Record<string,unknown>).ok !== true ||
      (parsed as Record<string,unknown>).probe !== "zoebuild-v12j11a")
    throw new ZoeRealProviderEvidenceError("REAL_PROVIDER_STRUCTURED_OUTPUT_INVALID");
  return {
    model,
    preflightInputTokens:counted,
    billedInputTokens:u.inputTokens,
    billedOutputTokens:u.outputTokens,
    cachedInputTokens:u.cachedInputTokens,
    reasoningOutputTokens:u.reasoningOutputTokens,
    responseIdDigest:createHash("sha256").update(m.providerResponseId).digest("hex").slice(0,16),
    providerHttpRequestIdPresent:Boolean(m.providerHttpRequestId),
    actualServiceTier:m.serviceTier,
  };
}

/** Uses the EXISTING first-party transport. No duplicated raw provider JSON parser. */
export function makeRealOpenAiProviderTransport(input: Readonly<{
  model:string; apiKey:string; fetchImpl?: Parameters<typeof createOpenAiJsonTransport>[0]["fetchImpl"];
}>): AiJsonTransport {
  return createOpenAiJsonTransport({model:input.model,apiKey:input.apiKey,
    baseURL:REAL_PROVIDER_GLOBAL_ENDPOINT,fetchImpl:input.fetchImpl});
}
