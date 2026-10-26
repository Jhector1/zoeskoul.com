import { describe, expect, it, vi } from "vitest";
import {
  boundedAiJsonOutputTokens,
  createClaudeAiJsonTransport,
  createDeepSeekAiJsonTransport,
  createGeminiAiJsonTransport,
  createOpenAiJsonTransport,
} from "./index";

const request = {
  system: "Return structured JSON.", user: "Generate.",
  schemaName: "BoundedExample", maxOutputTokens: 1536,
};

describe("provider-neutral bounded JSON execution", () => {
  it("rejects invalid caps before dispatch, and keeps uncapped calls explicit", () => {
    expect(boundedAiJsonOutputTokens({ ...request, maxOutputTokens: undefined })).toBeUndefined();
    for (const maxOutputTokens of [0, -1, 1.5, Number.NaN, 16385, Number.POSITIVE_INFINITY]) {
      expect(() => boundedAiJsonOutputTokens({ ...request, maxOutputTokens }))
        .toThrow("AI_JSON_OUTPUT_LIMIT_INVALID");
    }
  });
  it("OpenAI sends max_output_tokens to the Responses API", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: { body?: string }) => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ output_text: '{"ok":true}' }),
    }));
    const transport = createOpenAiJsonTransport({ model: "test-openai", apiKey: "unit", fetchImpl });
    await transport.generateJsonText(request);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body!)).toMatchObject({ max_output_tokens: 1536 });
  });
  it("Gemini sends maxOutputTokens in generation config", async () => {
    const generateContent = vi.fn(async (_args: unknown) => ({ text: '{"ok":true}' }));
    const transport = createGeminiAiJsonTransport({model: "gemini-test", apiKey: "unit",
      clientFactory: () => ({models: {generateContent}})});
    await transport.generateJsonText(request);
    expect(generateContent.mock.calls[0]![0]).toMatchObject({ config: { maxOutputTokens: 1536 } });
  });
  it("Claude sends max_tokens to the Messages API", async () => {
    const create = vi.fn(async (_args: unknown) => ({content: [{type: "text", text: '{"ok":true}'}]}));
    const transport = createClaudeAiJsonTransport({model: "claude-test", apiKey: "unit",
      clientFactory: () => ({messages: {create}})});
    await transport.generateJsonText(request);
    expect(create.mock.calls[0]![0]).toMatchObject({max_tokens: 1536});
  });
  it("DeepSeek sends max_tokens to chat completions", async () => {
    const create = vi.fn(async (_args: unknown) => ({choices:[{message:{content:'{"ok":true}'}}]}));
    const transport = createDeepSeekAiJsonTransport({model:"deepseek-chat", apiKey:"unit",
      clientFactory: () => ({chat:{completions:{create}}})});
    await transport.generateJsonText(request);
    expect(create.mock.calls[0]![0]).toMatchObject({max_tokens:1536});
  });
});
