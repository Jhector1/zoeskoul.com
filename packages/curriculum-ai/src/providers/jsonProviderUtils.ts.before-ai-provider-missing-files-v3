import type { GenerateJsonArgs, GeneratedJsonResult, GeneratedJsonMetadata } from "../types.js";
import { GeneratedJsonError } from "../types.js";

export const JSON_PROVIDER_DEFAULT_TEMPERATURE = 0;

export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

export function parseProviderJsonText<T>(text: string): T {
  const cleaned = stripCodeFences(text);

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    throw new Error(
      `Model returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }\n\nRaw output:\n${cleaned}`,
    );
  }
}

function stripNullCompatibilityFields(value: unknown): unknown {
  if (value === null) return undefined;

  if (Array.isArray(value)) {
    return value
      .map((item) => stripNullCompatibilityFields(item))
      .filter((item) => typeof item !== "undefined");
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalized = stripNullCompatibilityFields(child);
      if (typeof normalized !== "undefined") {
        next[key] = normalized;
      }
    }

    return next;
  }

  return value;
}

export function normalizeProviderJsonValue(
  schemaName: GenerateJsonArgs["schemaName"],
  value: unknown,
): unknown {
  if (schemaName === "TopicAuthoringDraft") {
    return stripNullCompatibilityFields(value);
  }

  return value;
}

export function getRuntimeValidationErrors(
  _schemaName: GenerateJsonArgs["schemaName"],
  _value: unknown,
): string[] {
  return [];
}

export function buildGeneratedJsonResult<T>(args: {
  metadata: GeneratedJsonMetadata;
  rawText: string;
  parsedJson: unknown;
  schemaName: GenerateJsonArgs["schemaName"];
}): GeneratedJsonResult<T> {
  const normalizedValue = normalizeProviderJsonValue(args.schemaName, args.parsedJson);
  const validationErrors = getRuntimeValidationErrors(args.schemaName, normalizedValue);

  if (validationErrors.length > 0) {
    throw new GeneratedJsonError({
      code: "SCHEMA_VALIDATION_FAILED",
      message: validationErrors.join("\n"),
      metadata: args.metadata,
      rawText: args.rawText,
      parsedJson: normalizedValue,
      validationErrors,
    });
  }

  return {
    ...args.metadata,
    rawText: args.rawText,
    parsedJson: args.parsedJson,
    value: normalizedValue as T,
  };
}

export function strictJsonSystemPrompt(system: string): string {
  return [
    system,
    "",
    "Return JSON only.",
    "Do not wrap the JSON in Markdown.",
    "Do not include commentary before or after the JSON.",
  ].join("\n");
}

export function generatedJsonMetadata(args: {
  provider: string;
  model: string;
  schemaName: GenerateJsonArgs["schemaName"];
  strictSchema?: boolean;
}): GeneratedJsonMetadata {
  return {
    provider: args.provider,
    model: args.model,
    temperature: JSON_PROVIDER_DEFAULT_TEMPERATURE,
    schemaName: args.schemaName,
    strictSchema: args.strictSchema ?? false,
  };
}
