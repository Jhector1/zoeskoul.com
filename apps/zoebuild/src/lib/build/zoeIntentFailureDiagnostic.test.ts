import { describe, expect, it } from "vitest";
import { diagnoseZoeIntentFailure as diagnose } from "./zoeIntentFailureDiagnostic";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/intent/route.ts", import.meta.url),"utf8");
describe("E17L.5 bounded intent diagnostics and no double-spend retry", () => {
  it("labels invalid model reply after dispatch without exposing reply content", () => {
    expect(diagnose(new Error("BUILD_INTENT_INVALID"),"response_validation"))
      .toEqual({phase:"response_validation",category:"MODEL_REPLY_CONTRACT_INVALID"});
  });
  it("labels provider status without exposing remote error body or API keys", () => {
    const error = new Error("OpenAI Responses API request failed (429): SECRET/remote error");
    expect(JSON.stringify(diagnose(error,"model_request"))).toBe('{"phase":"model_request","category":"MODEL_HTTP_429"}');
  });
  it("preserves existing canonical metering error codes, not nested causes", () => {
    const error = {name:"MeteredAiJsonError",code:"AI_METERING_PROVIDER_OUTCOME_UNKNOWN", message:"secret"};
    expect(diagnose(error,"model_request").category).toBe("AI_METERING_PROVIDER_OUTCOME_UNKNOWN");
    expect(diagnose({name:"MeteredAiJsonError",code:"SECRET"},"model_request").category).toBe("METERED_REQUEST_FAILED");
  });
  it("keeps existing billing transport, operation identity, and ledger retry handling unchanged", () => {
    expect(route).toContain("requireZoeAiBillingOperationId({");
    expect(route).toContain("createRequiredZoeBuildAssistantTransport({");
    // The validation stage and safe classifier must be wired correctly.
    // Ignore whitespace and whether the diagnostic helper is inlined or assigned.
    expect(route).toMatch(/\bphase\s*=\s*["']response_validation["']\s*;/);
    expect(route).toMatch(/console\.error\(\s*["']\[ZoeBuild assistant intent\] failed["']\s*,\s*\{\s*requestId\s*,\s*\.\.\.diagnoseZoeIntentFailure\(\s*error\s*,\s*phase\s*\)\s*\}\s*\)\s*;/);
    expect(route).toContain('phase="model_request";');
    expect(route).not.toContain('console.error(error)');
  });
});
