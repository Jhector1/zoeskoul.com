import { describe, expect, it } from "vitest";
import { assertAiJsonInputEnvelope } from "./aiJsonInputEnvelope";
import type { AiJsonRequest } from "./index";

const base: AiJsonRequest = {system: "system", user: "user", schemaName: "schema"};
const check = (request: AiJsonRequest = base, max = 1_000) =>
  assertAiJsonInputEnvelope(request, max);

describe("E16C4D4A full text/schema input payload guard", () => {
  it("counts system instructions, user text and schema name", () => {
    expect(check().totalUtf8Bytes).toBe(16);
  });
  it("includes JSON schema payload in sizing", () => {
    const schema = {type: "object", properties: {ok: {type: "boolean"}}};
    expect(check({...base, responseJsonSchema: schema}).totalUtf8Bytes)
      .toBe(16 + new TextEncoder().encode(JSON.stringify(schema)).byteLength);
  });
  it("measures UTF-8 bytes rather than JavaScript code units", () => {
    expect(check({...base, user: "🌟"}).totalUtf8Bytes).toBe(16);
  });
  it("fails closed for invalid server byte budgets", () => {
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => check(base, limit)).toThrow("AI_INPUT_BYTE_CAP_INVALID");
    }
  });
  it("rejects oversized payloads before dispatch", () => {
    expect(() => check(base, 15)).toThrow("AI_INPUT_PAYLOAD_TOO_LARGE");
  });
  it("rejects unpriced media, never silently dropping it", () => {
    expect(() => check({...base, media: [{kind: "image", mimeType: "image/png",
      source: {type: "url", url: "https://example.invalid/image.png"}}]}))
      .toThrow("AI_INPUT_UNPRICED_MEDIA");
  });
  it("refuses schema cycles and unsupported JSON values", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => check({...base, responseJsonSchema: cycle}))
      .toThrow("AI_INPUT_SCHEMA_REPEATED_OBJECT");
    expect(() => check({...base, responseJsonSchema: {x: () => 1} as never}))
      .toThrow("AI_INPUT_SCHEMA_NON_JSON");
  });
  it("rejects accessors to prevent hidden schema work while measuring", () => {
    const schema: Record<string, unknown> = {};
    Object.defineProperty(schema, "x", {enumerable: true, get: () => "secret"});
    expect(() => check({...base, responseJsonSchema: schema}))
      .toThrow("AI_INPUT_SCHEMA_ACCESSOR_UNSUPPORTED");
  });
});
