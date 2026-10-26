import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import type { AiJsonTextResult, AiJsonTransport, AiPricingVersion } from "@zoeskoul/ai-json";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(), settle: vi.fn(), journal: vi.fn(),
  bind: vi.fn(), capture: vi.fn(), receipt: vi.fn(),
}));
vi.mock("@zoeskoul/platform-server/ai-credits/ledger", () => ({
  reserveAiCredits: mocks.reserve,
  settleAiCredits: mocks.settle,
}));
vi.mock("@zoeskoul/platform-server/ai-credits/reconciliation", () => ({
  recordUncertainAiCreditCharge: mocks.journal,
}));
vi.mock("@zoeskoul/platform-server/ai-credits/provider-request", () => ({
  bindAiCreditProviderRequest: mocks.bind,
  captureAiCreditProviderResponse: mocks.capture,
  recordAiCreditPricedProviderReceipt: mocks.receipt,
}));
import { executeMeteredAiJsonRequest } from "./meteredAiJsonExecution";

const events: string[] = [];
const price: AiPricingVersion = {
  id: "unit-model-2026", provider: "openai", model: "unit-model",
  effectiveFrom: "2026-10-01T00:00:00.000Z", currency: "USD",
  rates: [
    { category: "input", usdPerMillionTokens: "2.00" },
    { category: "output", usdPerMillionTokens: "8.00" },
    { category: "cached_input", usdPerMillionTokens: "0.50" },
    { category: "cache_write", usdPerMillionTokens: "0.00" },
  ],
};
const conversion = {
  versionId: "unit-conversion", creditUnitsPerCredit: "1000000",
  creditValueUsdNano: "1000000000",
  markupNumerator: "1", markupDenominator: "1",
};
const defaultGenerate = async (): Promise<AiJsonTextResult> => {
  events.push("provider");
  return {
    text: '{"ok":true}',
    usage: {
      provider: "openai" as const,
      inputTokens: 1000, outputTokens: 100, cachedInputTokens: 200,
      cacheWriteInputTokens: 0, reasoningOutputTokens: null, providerRaw: {},
    },
    metadata: { provider: "openai", model: "unit-model", schemaName: "x",
      temperature: 0, serviceTier: "default", providerResponseId: "resp-test-001" },
  };
};
const generate = vi.fn(defaultGenerate);
const defaultCountInputTokens = async () => { events.push("count"); return 1000; };
const countInputTokens = vi.fn(defaultCountInputTokens);
const transport = {
  providerId: "openai", model: "unit-model",
  billingEndpointBaseUrl: "https://api.openai.com/v1",
  capabilities: { text: true, image: false, audio: false, video: false },
  generateJsonText: generate,
  countInputTokens,
} satisfies AiJsonTransport;
const params = {
  transport, request: { system: "s", user: "u", schemaName: "x", maxOutputTokens: 1024 },
  client: {} as PrismaClient, userId: "unit-user", idempotencyKey: "unit-run",
  pricingCatalog: [price], pricingVersionId: price.id,
  conversion, maximumUnits: "1000000", maxCombinedInputTokens: 1000,
  maxBillableOutputTokens: 1024, occurredAt: new Date("2026-10-19T10:00:00Z"),
};
beforeEach(() => {
  events.length = 0;
  // clearAllMocks() keeps unconsumed mockResolvedValueOnce/rejectedValueOnce
  // responses. Reset them between cases to avoid replaying an unrelated test's
  // provider result after a fail-closed, pre-dispatch rejection.
  vi.resetAllMocks();
  generate.mockImplementation(defaultGenerate);
  countInputTokens.mockImplementation(defaultCountInputTokens);
  mocks.reserve.mockImplementation(async () => {
    events.push("reserve"); return { id: "r1", created: true, status: "reserved" };
  });
  mocks.settle.mockImplementation(async () => {
    events.push("settle"); return { id: "r1", created: true, settledUnits: "2100" };
  });
  mocks.journal.mockResolvedValue({caseId: "case-1", newEvent: true});
  mocks.bind.mockImplementation(async () => {events.push("bind");return {id:"binding-1",created:true};});
  mocks.capture.mockImplementation(async () => {events.push("capture");return {captured:true};});
  mocks.receipt.mockImplementation(async () => {events.push("receipt");return {recorded:true};});
});
describe("E16C4A metered JSON dispatch", () => {
  it("stores an immutable priced receipt after checks and before settlement", async () => {
    await executeMeteredAiJsonRequest(params);
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture", "receipt", "settle"]);
    expect(mocks.receipt).toHaveBeenCalledWith(expect.objectContaining({
      userId: params.userId, reservationId: "r1",
      pricingVersionId: price.id, costUsdNano: "2500000",
      providerResponseId: "resp-test-001",
      usageSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });
  it("keeps funds held if priced usage cannot be recorded", async () => {
    mocks.receipt.mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.journal).toHaveBeenCalled();
  });
  it("never records trusted usage when provider tier fails validation", async () => {
    generate.mockImplementationOnce(async () => {
      const output = await defaultGenerate();
      return {...output, metadata: {...output.metadata, serviceTier: "priority"}};
    });
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it("reserves BEFORE the paid call and settles exact provider-reported usage", async () => {
    const response = await executeMeteredAiJsonRequest(params);
    expect(response.text).toBe('{"ok":true}');
    expect(countInputTokens).toHaveBeenCalledWith(expect.objectContaining({serviceTier: "default"}));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({serviceTier: "default"}));
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture", "receipt", "settle"]);
    // 800 ordinary input*2 + 200 cached*0.5 + 100 output*8 per million
    // = $0.0025 -> 2,500,000 USD nanodollars.
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({
      pricedUsage: { pricingVersionId: price.id, costUsdNano: "2500000" },
    }));
  });
  it("commits request linkage before provider dispatch and snapshots its identity", async () => {
    await executeMeteredAiJsonRequest(params);
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture", "receipt", "settle"]);
    expect(mocks.bind).toHaveBeenCalledWith(expect.objectContaining({
      userId: params.userId, reservationId: "r1", idempotencyKey: params.idempotencyKey,
      provider: "openai", model: "unit-model", requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      clientRequestId: expect.stringMatching(/^zb-[0-9a-f-]{36}$/),
    }));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      clientRequestId: mocks.bind.mock.calls[0][0].clientRequestId,
    }));
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      clientRequestId: mocks.bind.mock.calls[0][0].clientRequestId,
      providerResponseId: "resp-test-001",
    }));
  });
  it("does not dispatch or settle if pre-call identity cannot be stored", async () => {
    mocks.bind.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_PROVIDER_BINDING_FAILED");
    expect(generate).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.journal).toHaveBeenCalled();
  });
  it("holds provider money if returned response identity cannot be captured", async () => {
    mocks.capture.mockRejectedValueOnce(new Error("DB fail"));
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.journal).toHaveBeenCalled();
  });
  it("holds if provider omits its response ID", async () => {
    generate.mockImplementationOnce(async () => {
      const result = await defaultGenerate();
      return { ...result, metadata: { ...result.metadata, providerResponseId: undefined } };
    });
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("refuses uncapped metered calls before holding credits or calling a provider", async () => {
    await expect(executeMeteredAiJsonRequest({ ...params,
      request: { ...params.request, maxOutputTokens: undefined },
    }))
      .rejects.toThrow("AI_METERING_OUTPUT_LIMIT_REQUIRED");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("refuses invalid output-token caps before reserving", async () => {
    await expect(executeMeteredAiJsonRequest({ ...params,
      request: { ...params.request, maxOutputTokens: 0 },
    })).rejects.toThrow("AI_JSON_OUTPUT_LIMIT_INVALID");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("blocks missing, regional and custom endpoints before counting or reserving", async () => {
    for (const endpoint of [undefined, "https://eu.api.openai.com/v1",
      "https://us.api.openai.com/v1", "https://proxy.example.com/v1",
      "https://api.openai.com/v1/other"] as const) {
      await expect(executeMeteredAiJsonRequest({ ...params,
        transport: { ...transport, billingEndpointBaseUrl: endpoint },
      })).rejects.toThrow("AI_METERING_PROCESSING_REGION_UNVERIFIED");
    }
    expect(countInputTokens).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("requires a verified output allowance matching the enforced API cap", async () => {
    for (const allowance of [0, 1023, 1025, Number.NaN, 1.1]) {
      await expect(executeMeteredAiJsonRequest({ ...params,
        maxBillableOutputTokens: allowance,
      })).rejects.toThrow("AI_METERING_BILLABLE_OUTPUT_CAP_UNVERIFIED");
    }
    expect(countInputTokens).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("rejects oversized input before a wallet hold or paid provider call", async () => {
    await expect(executeMeteredAiJsonRequest({ ...params,
      request: { ...params.request, user: "x".repeat(64 * 1024 + 1) },
    })).rejects.toThrow("AI_INPUT_PAYLOAD_TOO_LARGE");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("counts the complete JSON schema as paid-request input", async () => {
    await expect(executeMeteredAiJsonRequest({ ...params,
      request: { ...params.request, responseJsonSchema: {
        type: "object", description: "z".repeat(64 * 1024),
      } },
    })).rejects.toThrow("AI_INPUT_PAYLOAD_TOO_LARGE");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("refuses malformed schema before reserving any credits", async () => {
    const schema: Record<string, unknown> = {};
    schema.self = schema;
    await expect(executeMeteredAiJsonRequest({ ...params,
      request: { ...params.request, responseJsonSchema: schema },
    })).rejects.toThrow("AI_INPUT_SCHEMA_REPEATED_OBJECT");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("dispatches a stable snapshot even if input changes while reserving", async () => {
    const schema = { type: "object", properties: { field: { type: "string" } } };
    const request = { ...params.request, user: "original", responseJsonSchema: schema };
    mocks.reserve.mockImplementationOnce(async () => {
      events.push("reserve");
      request.user = "changed-after-validation";
      schema.properties.field.type = "number";
      return { id: "r1", created: true, status: "reserved" };
    });
    await executeMeteredAiJsonRequest({ ...params, request });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      user: "original",
      responseJsonSchema: { type: "object", properties: { field: { type: "string" } } },
    }));
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture", "receipt", "settle"]);
  });
  it("blocks provider dispatch on insufficient credits", async () => {
    mocks.reserve.mockRejectedValueOnce(new Error("INSUFFICIENT_CREDITS"));
    await expect(executeMeteredAiJsonRequest(params)).rejects.toThrow("INSUFFICIENT_CREDITS");
    expect(generate).not.toHaveBeenCalled();
  });
  it("never repeats a paid call on idempotent reservation replay", async () => {
    mocks.reserve.mockResolvedValueOnce({ id: "r1", created: false, status: "reserved" });
    await expect(executeMeteredAiJsonRequest(params)).rejects.toThrow("AI_METERING_ALREADY_RESERVED");
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects unknown price snapshots before spending", async () => {
    await expect(executeMeteredAiJsonRequest({ ...params, pricingCatalog: [] }))
      .rejects.toThrow("PRICE_VERSION_NOT_UNIQUE");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("refuses unpriced media before reservation", async () => {
    await expect(executeMeteredAiJsonRequest({ ...params, request: {
      ...params.request, media: [{ kind: "image", mimeType: "image/png", source: { type: "base64", data: "AA==" } }],
    } })).rejects.toThrow("AI_METERING_MULTIMODAL_NOT_PRICED");
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("holds the reserved credits if provider actually used a premium tier", async () => {
    generate.mockImplementationOnce(async () => {
      events.push("provider");
      return { text: '{"ok":true}',
        usage: { provider: "openai" as const, inputTokens: 1000,
          outputTokens: 100, cachedInputTokens: 200,
          cacheWriteInputTokens: 0, reasoningOutputTokens: null, providerRaw: {} },
        metadata: {provider: "openai", model: "unit-model", schemaName: "x",
          temperature: 0, serviceTier: "priority", providerResponseId: "resp-test-001"},
      };
    });
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture"]);
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("holds the reserved credits if actual provider tier is not reported", async () => {
    generate.mockImplementationOnce(async () => {
      events.push("provider");
      return { text: '{"ok":true}',
        usage: { provider: "openai" as const, inputTokens: 1000,
          outputTokens: 100, cachedInputTokens: 200,
          cacheWriteInputTokens: 0, reasoningOutputTokens: null, providerRaw: {} },
        metadata: {provider: "openai", model: "unit-model", schemaName: "x", temperature: 0, providerResponseId: "resp-test-001"},
      };
    });
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture"]);
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("settles exact provider cache-write costs using the reviewed category rate", async () => {
    const withPremium = { ...price, rates: price.rates.map(r =>
      r.category === "cache_write" ? {...r, usdPerMillionTokens: "2.50"} : r) };
    generate.mockImplementationOnce(async () => {
      events.push("provider");
      return { text: '{"ok":true}', usage: {
        provider:"openai", inputTokens: 1000, cachedInputTokens: 200,
        cacheWriteInputTokens: 300, outputTokens:100, reasoningOutputTokens: null,
        providerRaw: {input_tokens_details: {cache_write_tokens_details: {
          ttl_30m_tokens:300, ttl_12h_tokens:0,
        }}},
      }, metadata: {provider:"openai", model:"unit-model", schemaName:"x",
        temperature:0, serviceTier:"default", providerResponseId:"resp-test-001"} };
    });
    await executeMeteredAiJsonRequest({...params, pricingCatalog:[withPremium]});
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({
      pricedUsage: {pricingVersionId:price.id, costUsdNano:"2650000"},
    }));
    expect(events).toEqual(["count","reserve","bind","provider","capture","receipt","settle"]);
  });
  for (const [name, details] of [
    ["unreviewed 12h write", {ttl_30m_tokens:299,ttl_12h_tokens:1}],
    ["unverified positive write", undefined],
    ["inconsistent provider write counts", {ttl_30m_tokens:200,ttl_12h_tokens:0}],
  ] as const) {
    it(`holds funds and never settles ${name}`, async () => {
      generate.mockImplementationOnce(async () => {
        events.push("provider");
        return {
          text:'{"ok":true}',
          usage:{provider:"openai" as const,inputTokens:1000,outputTokens:100,
            cachedInputTokens:200,cacheWriteInputTokens:300,
            reasoningOutputTokens:0,
            providerRaw:{input_tokens_details:{
              ...(details === undefined ? {} : {cache_write_tokens_details:details}),
            }}},
          metadata:{provider:"openai" as const,model:"unit-model",schemaName:"x",
            temperature:0,serviceTier:"default",providerResponseId:"resp-test-001"},
        };
      });
      await expect(executeMeteredAiJsonRequest(params))
        .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
      expect(mocks.settle).not.toHaveBeenCalled();
      expect(mocks.receipt).not.toHaveBeenCalled();
      expect(mocks.journal).toHaveBeenCalledWith(expect.objectContaining({
        reason:"AI_METERING_SETTLEMENT_PENDING",
      }));
      expect(events).toEqual(["count","reserve","bind","provider","capture"]);
    });
  }
  it("holds the reservation when the OpenAI cache-write counter is missing", async () => {
    generate.mockImplementationOnce(async () => {
      events.push("provider");
      return { text: '{"ok":true}', usage: {
        provider:"openai", inputTokens:1000, cachedInputTokens:200,
        cacheWriteInputTokens:null, outputTokens:100, reasoningOutputTokens:null,
        providerRaw:{},
      }, metadata:{provider:"openai", model:"unit-model", schemaName:"x",
        temperature:0,serviceTier:"default", providerResponseId:"resp-test-001"} };
    });
    await expect(executeMeteredAiJsonRequest(params)).rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(events).toEqual(["count","reserve","bind","provider", "capture"]);
  });
  it("holds reservation when output billing exceeds the enforced maximum", async () => {
    generate.mockImplementationOnce(async () => {
      events.push("provider");
      return {text: "ok", metadata: {provider: "openai", model: "unit-model",
        schemaName: "x", temperature: 0, serviceTier: "default", providerResponseId: "resp-test-001"},
        usage: {provider: "openai", inputTokens: 1000, cachedInputTokens: 0,
          cacheWriteInputTokens: 0, outputTokens: 1025,
          reasoningOutputTokens: 0, providerRaw: {}},
      };
    });
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture"]);
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("holds reservation when reasoning tokens exceed reported output", async () => {
    generate.mockImplementationOnce(async () => {
      events.push("provider");
      return {text: "ok", metadata: {provider: "openai", model: "unit-model",
        schemaName: "x", temperature: 0, serviceTier: "default", providerResponseId: "resp-test-001"},
        usage: {provider: "openai", inputTokens: 1000, cachedInputTokens: 0,
          cacheWriteInputTokens: 0, outputTokens: 50,
          reasoningOutputTokens: 51, providerRaw: {}},
      };
    });
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture"]);
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("allows output exactly at the enforced maximum", async () => {
    generate.mockImplementationOnce(async () => {
      events.push("provider");
      return {text: "ok", metadata: {provider: "openai", model: "unit-model",
        schemaName: "x", temperature: 0, serviceTier: "default", providerResponseId: "resp-test-001"},
        usage: {provider: "openai", inputTokens: 1000, cachedInputTokens: 0,
          cacheWriteInputTokens: 0, outputTokens: 1024,
          reasoningOutputTokens: 900, providerRaw: {}},
      };
    });
    await executeMeteredAiJsonRequest(params);
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture", "receipt", "settle"]);
  });
  it("holds the reservation when usage is missing", async () => {
    generate.mockResolvedValueOnce({ text: "ok", usage: null,
      metadata: { provider: "openai", model: "unit-model", schemaName: "x", temperature: 0, providerResponseId: "resp-test-001" } } as never);
    await expect(executeMeteredAiJsonRequest(params)).rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("holds the reservation when provider fails after dispatch", async () => {
    generate.mockRejectedValueOnce(new Error("Provider timed out"));
    await expect(executeMeteredAiJsonRequest(params)).rejects.toThrow("AI_METERING_PROVIDER_OUTCOME_UNKNOWN");
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("holds the reservation on settlement failure", async () => {
    mocks.settle.mockRejectedValueOnce(new Error("SETTLEMENT_EXCEEDS_RESERVED"));
    await expect(executeMeteredAiJsonRequest(params)).rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
  });
  it("rejects metered transports without a provider-side input count before credits", async () => {
    const uncounted = { ...transport, countInputTokens: undefined };
    await expect(executeMeteredAiJsonRequest({ ...params, transport: uncounted }))
      .rejects.toThrow("AI_METERING_INPUT_COUNT_UNVERIFIED");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects a provider count larger than the reviewed input ceiling", async () => {
    countInputTokens.mockResolvedValueOnce(1001);
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_INPUT_CEILING_EXCEEDED");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("holds no credits on input-count provider failure", async () => {
    countInputTokens.mockRejectedValueOnce(new Error("count API down"));
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_INPUT_COUNT_FAILED");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("refuses non-OpenAI count estimates, even if a counter is present", async () => {
    await expect(executeMeteredAiJsonRequest({ ...params,
      transport: { ...transport, providerId: "deepseek", model: "unit-model" },
      pricingCatalog: [{ ...price, provider: "deepseek" }],
    })).rejects.toThrow("AI_METERING_INPUT_COUNT_UNVERIFIED");
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("holds the reservation if reported input billing exceeds reviewed bound", async () => {
    generate.mockImplementationOnce(async () => {
      events.push("provider");
      return { text: "ok", usage: {
        provider: "openai", inputTokens: 1001, outputTokens: 10,
        cachedInputTokens: 0, cacheWriteInputTokens: 0,
        reasoningOutputTokens: null, providerRaw: {},
      }, metadata: { provider: "openai", model: "unit-model", schemaName: "x", temperature: 0, providerResponseId: "resp-test-001" } } as never;
    });
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture"]);
  });
  it("does not silently price Gemini thinking tokens as free", async () => {
    const gemini = { ...transport, providerId: "gemini", model: "gemini-test" };
    generate.mockResolvedValueOnce({ text: "ok",
      usage: { provider: "gemini", inputTokens: 100, outputTokens: 50,
        reasoningOutputTokens: 10, cachedInputTokens: null, cacheWriteInputTokens: null, providerRaw: {} },
      metadata: { provider: "gemini", model: "gemini-test", schemaName: "x", temperature: 0 },
    } as never);
    await expect(executeMeteredAiJsonRequest({ ...params, transport: gemini,
      pricingCatalog: [{ ...price, provider: "gemini", model: "gemini-test" }] }))
      .rejects.toThrow("AI_METERING_INPUT_COUNT_UNVERIFIED");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("journals a provider-uncertain charge without releasing funds", async () => {
    generate.mockRejectedValueOnce(new Error("network ended after dispatch"));
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_PROVIDER_OUTCOME_UNKNOWN");
    expect(mocks.journal).toHaveBeenCalledWith(expect.objectContaining({
      userId: "unit-user", idempotencyKey: "unit-run",
      reason: "AI_METERING_PROVIDER_OUTCOME_UNKNOWN",
    }));
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it("journals settlement uncertainty without replacing the original failure", async () => {
    mocks.settle.mockRejectedValueOnce(new Error("SETTLEMENT_EXCEEDS_RESERVED"));
    mocks.journal.mockRejectedValueOnce(new Error("journal temporarily unavailable"));
    await expect(executeMeteredAiJsonRequest(params))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(mocks.journal).toHaveBeenCalledWith(expect.objectContaining({
      reason: "AI_METERING_SETTLEMENT_PENDING",
    }));
    expect(events).toEqual(["count", "reserve", "bind", "provider", "capture", "receipt"]);
    expect(mocks.receipt).toHaveBeenCalledTimes(1);
  });
});

// V12J.10A: recovered results must not cause a second billable provider request.
describe("V12J.10A encrypted result journal composition", () => {
  it("persists original response after receipt and before settlement", async () => {
    const journal={preserve:vi.fn(async()=>{events.push("preserve")}),restore:vi.fn()};
    await executeMeteredAiJsonRequest({...params,resultJournal:journal});
    expect(events).toEqual(["count","reserve","bind","provider","capture","receipt","preserve","settle"]);
    expect(journal.preserve).toHaveBeenCalledWith(expect.objectContaining({
      userId:params.userId,idempotencyKey:params.idempotencyKey,
      requestSha256:expect.stringMatching(/^[a-f0-9]{64}$/),
      providerResponseId:"resp-test-001",reservationId:"r1",
    }));
  });
  it("returns an authorized saved result without second dispatch",async()=>{
    mocks.reserve.mockResolvedValue({id:"r1",created:false,status:"settled"});
    const cached=await defaultGenerate(); events.length=0;
    const journal={preserve:vi.fn(),restore:vi.fn(async()=>cached)};
    const output=await executeMeteredAiJsonRequest({...params,resultJournal:journal});
    expect(output.text).toBe(cached.text);
    expect(events).toEqual(["count"]);
    expect(generate).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(journal.restore).toHaveBeenCalledOnce();
  });
  it("fails closed when replay has no saved result",async()=>{
    mocks.reserve.mockResolvedValue({id:"r1",created:false,status:"reserved"});
    const journal={preserve:vi.fn(),restore:vi.fn(async()=>null)};
    await expect(executeMeteredAiJsonRequest({...params,resultJournal:journal}))
      .rejects.toThrow("AI_METERING_ALREADY_RESERVED");
    expect(generate).not.toHaveBeenCalled();
  });
  it("does not settle if encrypted storage fails",async()=>{
    const journal={preserve:vi.fn(async()=>{throw new Error("storage refused")}),restore:vi.fn()};
    await expect(executeMeteredAiJsonRequest({...params,resultJournal:journal}))
      .rejects.toThrow("AI_METERING_SETTLEMENT_PENDING");
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.journal).toHaveBeenCalledOnce();
  });
  it("rejects replay evidence failure without re-dispatch",async()=>{
    mocks.reserve.mockResolvedValue({id:"r1",created:false,status:"reserved"});
    const journal={preserve:vi.fn(),restore:vi.fn(async()=>{throw new Error("identity mismatch")})};
    await expect(executeMeteredAiJsonRequest({...params,resultJournal:journal}))
      .rejects.toThrow("AI_METERING_REPLAY_REVIEW_REQUIRED");
    expect(generate).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
