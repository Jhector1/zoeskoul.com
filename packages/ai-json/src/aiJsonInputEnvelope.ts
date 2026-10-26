import type { AiJsonRequest } from "./index";

/**
 * E16C4D4A: server-side, deterministic JSON request PAYLOAD size guard.
 * Counts every caller-controlled textual field and the schema JSON, not just
 * the user's prompt. This is NOT an upper bound on provider billable tokens:
 * providers may add framing, tool schemas, hidden instructions, or use different
 * tokenization. Never use this result to authorize credit reservations alone.
 */
export class AiJsonInputEnvelopeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiJsonInputEnvelopeError";
  }
}

export type AiJsonInputEnvelope = Readonly<{
  totalUtf8Bytes: number;
  maxUtf8Bytes: number;
  includesSchema: boolean;
}>;

function jsonSchemaText(value: unknown): string {
  const visited = new WeakSet<object>();
  function validate(node: unknown, depth: number): void {
    if (depth > 64) throw new AiJsonInputEnvelopeError("AI_INPUT_SCHEMA_DEPTH_UNSUPPORTED");
    if (node === null || typeof node === "string" || typeof node === "boolean") return;
    if (typeof node === "number" && Number.isFinite(node)) return;
    if (Array.isArray(node)) {
      if (visited.has(node)) throw new AiJsonInputEnvelopeError("AI_INPUT_SCHEMA_REPEATED_OBJECT");
      visited.add(node);
      for (const element of node) validate(element, depth + 1);
      return;
    }
    if (typeof node === "object" && node !== null &&
        (Object.getPrototypeOf(node) === Object.prototype || Object.getPrototypeOf(node) === null)) {
      if (visited.has(node)) throw new AiJsonInputEnvelopeError("AI_INPUT_SCHEMA_REPEATED_OBJECT");
      visited.add(node);
      for (const key of Object.keys(node)) {
        const descriptor = Object.getOwnPropertyDescriptor(node, key);
        if (!descriptor || !Object.hasOwn(descriptor, "value"))
          throw new AiJsonInputEnvelopeError("AI_INPUT_SCHEMA_ACCESSOR_UNSUPPORTED");
        validate(descriptor.value, depth + 1);
      }
      return;
    }
    throw new AiJsonInputEnvelopeError("AI_INPUT_SCHEMA_NON_JSON");
  }
  validate(value, 0);
  try {
    const encoded = JSON.stringify(value);
    if (typeof encoded !== "string") throw new Error("Nonserializable JSON");
    return encoded;
  } catch {
    throw new AiJsonInputEnvelopeError("AI_INPUT_SCHEMA_SERIALIZATION_FAILED");
  }
}

/**
 * maxUtf8Bytes must be a trusted server-owned policy value, never a client claim.
 * The measured size is a necessary payload constraint, not a pricing ceiling.
 */
export function assertAiJsonInputEnvelope(
  request: AiJsonRequest,
  maxUtf8Bytes: number,
): AiJsonInputEnvelope {
  if (!Number.isSafeInteger(maxUtf8Bytes) || maxUtf8Bytes < 1) {
    throw new AiJsonInputEnvelopeError("AI_INPUT_BYTE_CAP_INVALID");
  }
  if (request.media?.length) {
    throw new AiJsonInputEnvelopeError("AI_INPUT_UNPRICED_MEDIA");
  }
  const fields = [request.system, request.user, request.schemaName];
  if (fields.some(v => typeof v !== "string")) {
    throw new AiJsonInputEnvelopeError("AI_INPUT_TEXT_FIELD_INVALID");
  }
  const schema = request.responseJsonSchema === undefined ? undefined : jsonSchemaText(request.responseJsonSchema);
  const encoder = new TextEncoder();
  let totalUtf8Bytes = 0;
  for (const value of schema === undefined ? fields : [...fields, schema]) {
    totalUtf8Bytes += encoder.encode(value).byteLength;
    if (!Number.isSafeInteger(totalUtf8Bytes) || totalUtf8Bytes > maxUtf8Bytes) {
      throw new AiJsonInputEnvelopeError("AI_INPUT_PAYLOAD_TOO_LARGE");
    }
  }
  return {totalUtf8Bytes, maxUtf8Bytes, includesSchema: schema !== undefined};
}
