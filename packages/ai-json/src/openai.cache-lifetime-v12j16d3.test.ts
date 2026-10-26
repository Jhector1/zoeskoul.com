import { describe, expect, it } from "vitest";
import { createOpenAiJsonTransport, type OpenAiFetchLike } from "./openai";

const request = {
  system: "Return JSON only.", user: "Update one text heading.", schemaName: "SingleEdit",
  serviceTier: "default" as const, maxOutputTokens: 128,
};
function createCapture(): { fetchImpl: OpenAiFetchLike; bodies: Record<string, unknown>[]; urls: string[] } {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  return {
    bodies, urls,
    fetchImpl: async (url, init) => {
      urls.push(url);
      bodies.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
      const count = url.endsWith("/input_tokens");
      return { ok: true, status: 200, headers: { get: () => null },
        text: async () => JSON.stringify(count ?
          {object: "response.input_tokens", input_tokens: 32} :
          {id: "resp-test", service_tier: "default", output_text: '{"ok":true}'}) };
    },
  };
}

describe("V12J.16D3 — metered Luna cache write lifetime", () => {
  it("pins generation to the reviewed 30-minute write rate without storing the response", async () => {
    const captured = createCapture();
    const t = createOpenAiJsonTransport({model:"gpt-6-luna", apiKey:"not-real", fetchImpl: captured.fetchImpl});
    await t.generateJsonText(request);
    expect(captured.urls).toEqual(["https://api.openai.com/v1/responses"]);
    expect(captured.bodies[0]).toMatchObject({ model:"gpt-6-luna", store:false,
      service_tier:"default", truncation:"disabled", max_output_tokens:128,
      prompt_cache_options:{ mode:"implicit", ttl:"30m" } });
    expect(JSON.stringify(captured.bodies[0])).not.toContain('"12h"');
  });
  it("keeps token-count envelope identical without unsupported generation-only cache options", async () => {
    const captured = createCapture();
    const t = createOpenAiJsonTransport({model:"gpt-6-luna", apiKey:"not-real", fetchImpl: captured.fetchImpl});
    // AiJsonTransport exposes counting as an optional capability. This OpenAI
    // transport must provide it for the metered-edit path.
    const countInputTokens = t.countInputTokens;
    if (typeof countInputTokens !== "function") {
      throw new Error("OpenAI metered transport must support input token counting");
    }
    expect(await countInputTokens(request)).toBe(32);
    await t.generateJsonText(request);
    expect(captured.urls[0]).toBe("https://api.openai.com/v1/responses/input_tokens");
    expect(captured.bodies[0]).not.toHaveProperty("prompt_cache_options");
    expect(captured.bodies[0]).not.toHaveProperty("max_output_tokens");
    expect(captured.bodies[0]).not.toHaveProperty("store");
    expect(captured.bodies[0]).not.toHaveProperty("service_tier");
    const generated = captured.bodies[1]!;
    const {prompt_cache_options: _cache, store:_store, max_output_tokens:_max,
      service_tier:_tier, truncation:_truncation, ...generationInputEnvelope} = generated;
    expect(captured.bodies[0]).toEqual(generationInputEnvelope);
  });
  it("does not change other models' transport caching behavior", async () => {
    const captured = createCapture();
    const t = createOpenAiJsonTransport({model:"gpt-6.1-sol", apiKey:"not-real", fetchImpl:captured.fetchImpl});
    await t.generateJsonText(request);
    expect(captured.bodies[0]).not.toHaveProperty("prompt_cache_options");
  });
});
