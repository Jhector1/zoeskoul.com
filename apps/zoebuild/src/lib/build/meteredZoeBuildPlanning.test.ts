import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock("./meteredAiJsonExecution", () => ({
  executeMeteredAiJsonRequest: mocks.dispatch,
  MAX_METERED_TEXT_PAYLOAD_UTF8_BYTES: 64 * 1024,
}));
vi.mock("./aiCreditResultJournal", () => ({
  createPrismaAiCreditResultJournal: () => ({preserve: vi.fn(), restore: vi.fn()}),
}));
vi.mock("./createZoeBuildAiPlanner", () => ({
  createZoeBuildAiJsonTransport: mocks.createTransport,
}));
vi.mock("@zoeskoul/build-ai", () => ({
  createBuildAiPlannerFromJsonTransport: (transport: {
    generateJsonText: (input: object) => Promise<{metadata: {provider: string; model: string}}>;
  }) => ({
    generateProjectSpecification: async (input: {prompt: string; maxOutputTokens?: number}) => {
      const result = await transport.generateJsonText({
        system: "system", user: input.prompt, schemaName: "test",
        responseJsonSchema: {type: "object", properties: {page: {type: "string"}}},
        maxOutputTokens: input.maxOutputTokens,
      });
      return { specification: {}, metadata: result.metadata };
    },
  }),
}));
import { createMeteredZoeBuildAttemptPlanner } from "./meteredZoeBuildPlanning";

const candidate = {
  provider: "openai" as const, model: "approved-test-model",
  tier: "economy" as const, reason: "test",
};
const policy = {
  pricingVersionId: "server-verified-1",
  maxOutputTokens: 1024,
  maxBillableOutputTokens: 1024,
  maxCombinedInputTokens: 1000,
  pricingCatalog: [{id: "server-verified-1", provider: "openai" as const,
    model: "approved-test-model", effectiveFrom: "2020-01-01T00:00:00Z", currency: "USD" as const,
    rates: [{category: "input" as const, usdPerMillionTokens: "2"},
      {category: "cached_input" as const, usdPerMillionTokens: "0.5"},
      {category: "cache_write" as const, usdPerMillionTokens: "0"},
      {category: "output" as const, usdPerMillionTokens: "8"}]}],
  evidence: {
    sourceUrl: "https://platform.openai.com/docs/models", verifierId: "fixture-reviewer",
    verifiedAt: new Date(Date.now() - 60_000).toISOString(),
    provider: "openai" as const, model: "approved-test-model",
    pricingVersionId: "server-verified-1",
    inputLimitCoversAllBilledInput: true as const,
    outputLimitCoversReasoningTokens: true as const,
    noOtherBillableFeatures: true as const,
  },
  conversion: {
    versionId: "credit-v1", creditUnitsPerCredit: "1000",
    creditValueUsdNano: "10000000", markupNumerator: "1", markupDenominator: "1",
  },
};
const metering = {
  client: {} as any, userId: "user-1", operationId: "server-operation-1",
  resolveAttemptPolicy: vi.fn(async (
    _candidate: unknown, _attempt: number,
    _request: {user: string; responseJsonSchema?: unknown},
  ) => policy),
};
function create(attemptIndex: number, override = metering) {
  return createMeteredZoeBuildAttemptPlanner({candidate, attemptIndex, metering: override});
}
describe("E16C4C metered planner attempt ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTransport.mockReturnValue({providerId: "openai", model: "approved-test-model",
      capabilities: {text: true, image: false, audio: false, video: false},
      generateJsonText: vi.fn()});
    mocks.dispatch.mockResolvedValue({metadata: {provider: "openai", model: "approved-test-model"}});
    metering.resolveAttemptPolicy.mockResolvedValue({...policy, evidence: {...policy.evidence, verifiedAt: new Date(Date.now() - 60_000).toISOString()}});
  });
  it("uses server policy and meters before returning the planner result", async () => {
    const planner = create(0);
    const result = await planner.generateProjectSpecification({prompt: "example"});
    expect(result.metadata.model).toBe("approved-test-model");
    expect(mocks.dispatch).toHaveBeenCalledOnce();
    expect(metering.resolveAttemptPolicy).toHaveBeenCalledWith(
      candidate, 0, expect.objectContaining({
        system: "system", user: "example", schemaName: "test",
        responseJsonSchema: {type: "object", properties: {page: {type: "string"}}},
      }),
    );
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "server-operation-1:attempt:0", pricingVersionId: "server-verified-1",
      maximumUnits: "1020", maxBillableOutputTokens: 1024,
      request: expect.objectContaining({maxOutputTokens: 1024}),
    }));
  });
  it("fails closed with unverified pricing before a transport exists", async () => {
    metering.resolveAttemptPolicy.mockResolvedValueOnce({...policy, pricingCatalog: []});
    await expect(create(0).generateProjectSpecification({prompt: "example"})).rejects.toThrow("PRICE_VERSION_NOT_UNIQUE");
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("refuses multimedia before any provider is constructed", async () => {
    await expect(create(0).generateProjectSpecification({prompt: "example",
      media: [{kind: "image", mimeType: "image/png", data: "fake"} as never]}))
      .rejects.toThrow("BUILD_AI_METERING_MULTIMODAL_UNPRICED");
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
  it("rejects an oversized complete planner request BEFORE policy or provider creation", async () => {
    await expect(create(0).generateProjectSpecification({prompt: "x".repeat(65_536)}))
      .rejects.toThrow("AI_INPUT_PAYLOAD_TOO_LARGE");
    expect(metering.resolveAttemptPolicy).not.toHaveBeenCalled();
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("does not permit an async policy resolver to rewrite dispatched request", async () => {
    metering.resolveAttemptPolicy.mockImplementationOnce(async (_c, _i, draft) => {
      // The resolver sees a copy of the actual planner payload, not the dispatch copy.
      (draft as {user: string}).user = "malicious-larger-input";
      (draft.responseJsonSchema as {properties: {page: {type: string}}}).properties.page.type = "number";
      return policy;
    });
    await create(0).generateProjectSpecification({prompt: "original"});
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({
        user: "original",
        responseJsonSchema: {type: "object", properties: {page: {type: "string"}}},
        maxOutputTokens: 1024,
      }),
    }));
  });
  it("refuses an actual transport whose provider/model differ from the reviewed candidate", async () => {
    mocks.createTransport.mockReturnValueOnce({
      providerId: "claude", model: "other", capabilities: {text: true, image: false, audio: false, video: false},
    });
    await expect(create(0).generateProjectSpecification({prompt: "example"}))
      .rejects.toThrow("BUILD_AI_METERING_TRANSPORT_MISMATCH");
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("generates a separate reservation key for fallback attempts", async () => {
    await create(0).generateProjectSpecification({prompt: "example"});
    await create(1).generateProjectSpecification({prompt: "example"});
    expect(mocks.dispatch.mock.calls.map(([call]) => call.idempotencyKey)).toEqual([
      "server-operation-1:attempt:0", "server-operation-1:attempt:1",
    ]);
  });
  it("refuses missing price policy without calling a provider", async () => {
    metering.resolveAttemptPolicy.mockRejectedValueOnce(new Error("PRICING_UNAVAILABLE"));
    await expect(create(0).generateProjectSpecification({prompt: "example"})).rejects.toThrow("PRICING_UNAVAILABLE");
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("rejects invalid output ceilings before a paid transport exists", async () => {
    metering.resolveAttemptPolicy.mockResolvedValueOnce({...policy, maxOutputTokens: 0});
    await expect(create(0).generateProjectSpecification({prompt: "example"})).rejects.toThrow("AI_JSON_OUTPUT_LIMIT_INVALID");
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });
  it("requires server-owned operation IDs and nonnegative attempts", () => {
    expect(() => create(-1)).toThrow("BUILD_AI_METERING_ATTEMPT_INVALID");
    expect(() => create(0, {...metering, operationId: ""})).toThrow("BUILD_AI_METERING_IDENTITY_INVALID");
  });
});
