import { describe, expect, it, vi } from "vitest";
import type { AiJsonTransport } from "@zoeskoul/ai-json";
import {
  createRequiredZoeBuildAssistantTransport,
  createRequiredZoeBuildPlanningMetering,
} from "./serverOwnedZoeBuildMetering";

vi.mock("@zoeskoul/platform-server/prisma", () => ({ prisma: {} }));

function fakeTransport() {
  const calls = { generation: 0, counting: 0 };
  const transport: AiJsonTransport = {
    providerId: "openai", model: "unreviewed-v12j9c-test-model",
    billingEndpointBaseUrl: "https://api.openai.com/v1",
    capabilities: { text: true, image: false, audio: false, video: false },
    async countInputTokens() { calls.counting++; return 10; },
    async generateJsonText() {
      calls.generation++;
      throw new Error("UNEXPECTED_PAID_PROVIDER_DISPATCH");
    },
  };
  return { transport, calls };
}
const request = {
  system: "Respond in JSON.", user: "Classify the active project request.",
  schemaName: "ZoeSemanticIntentV1",
  responseJsonSchema: { type: "object", properties: { action: {type:"string"} } },
};

describe("V12J.9C required metering composition and production-review gates", () => {
  it("cannot call AI provider or count tokens while production pricing registry is empty", async () => {
    const {transport,calls} = fakeTransport();
    const metered = createRequiredZoeBuildAssistantTransport({
      transport, userId:"test-user", operationId:"server-generated-unique-operation",
      purpose:"intent",
    });
    await expect(metered.generateJsonText(request)).rejects.toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
    expect(calls).toEqual({generation:0,counting:0});
  });
  it("separates assistant editing from intent with an independent purpose", async () => {
    const {transport,calls} = fakeTransport();
    const metered = createRequiredZoeBuildAssistantTransport({
      transport, userId:"test-user", operationId:"other-operation", purpose:"edit",
    });
    await expect(metered.generateJsonText({...request, requestReasoningSummary:true,
      onReasoningSummaryDelta: () => { throw new Error("STREAM_UNEXPECTED"); }}))
      .rejects.toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
    expect(calls.generation).toBe(0);
  });
  it("rejects unpriced media before the policy registry or provider", async () => {
    const {transport,calls} = fakeTransport();
    const metered = createRequiredZoeBuildAssistantTransport({
      transport, userId:"test-user", operationId:"op-3", purpose:"edit",
    });
    await expect(metered.generateJsonText({...request, media:[{
      kind:"image",mimeType:"image/png",source:{type:"url",url:"https://example.test/img"},
    }]})).rejects.toThrow("AI_METERING_ROUTE_MEDIA_UNPRICED");
    expect(calls.generation).toBe(0);
  });
  it("rejects unknown provider and invalid identities", () => {
    const {transport} = fakeTransport();
    expect(() => createRequiredZoeBuildAssistantTransport({
      transport: {...transport,providerId:"unreviewed"},
      userId:"test-user",operationId:"op-4",purpose:"edit",
    })).toThrow("AI_METERING_ROUTE_PROVIDER_UNSUPPORTED");
    expect(() => createRequiredZoeBuildPlanningMetering({userId:"",operationId:"op-5"}))
      .toThrow("AI_METERING_ROUTE_IDENTITY_INVALID");
  });
  it("planning policies come exclusively from the production-approved registry", async () => {
    const context = createRequiredZoeBuildPlanningMetering({
      userId:"test-user", operationId:"server-operation",
    });
    await expect(context.resolveAttemptPolicy(
      {provider:"openai",model:"unreviewed-v12j9c-test-model",tier:"economy",reason:"test"},
      0,request,
    )).rejects.toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
  });
});
