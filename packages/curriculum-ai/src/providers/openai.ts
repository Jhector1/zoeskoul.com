import OpenAI from "openai";
import {
  TOPIC_AUTHORING_DRAFT_JSON_SCHEMA,
  validateTopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider, GenerateJsonArgs, GeneratedJsonResult } from "../types.js";
import { GeneratedJsonError } from "../types.js";

type JsonSchema = Record<string, unknown>;
const OPENAI_DEFAULT_TEMPERATURE = 0;
const OPENAI_DETERMINISTIC_SEED = 0;
const OPENAI_STRUCTURED_OUTPUT_UNSUPPORTED_KEYWORDS = [
  "anyOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "$ref",
  "patternProperties",
  "unevaluatedProperties",
] as const;

function getEnv(name: "OPENAI_API_KEY" | "OPENAI_MODEL"): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function defaultClientFactory() {
  return new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
}

let clientFactory = defaultClientFactory;

function createClient() {
  return clientFactory();
}

export function setOpenAiClientFactoryForTests(
  factory: typeof clientFactory,
): void {
  clientFactory = factory;
}

export function resetOpenAiClientFactoryForTests(): void {
  clientFactory = defaultClientFactory;
}

let modelResolver = () => getEnv("OPENAI_MODEL");

export function setOpenAiModelResolverForTests(
  resolver: typeof modelResolver,
): void {
  modelResolver = resolver;
}

export function resetOpenAiModelResolverForTests(): void {
  modelResolver = () => getEnv("OPENAI_MODEL");
}

function getModel(): string {
  return modelResolver();
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  return trimmed
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
}

function parseJsonText<T>(text: string): T {
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

function getRuntimeValidationErrors(
  schemaName: GenerateJsonArgs["schemaName"],
  value: unknown,
): string[] {
  if (schemaName === "TopicAuthoringDraft") {
    const result = validateTopicAuthoringDraft(value);
    return result.ok ? [] : result.errors;
  }

  return [];
}

export function assertOpenAiStructuredOutputSchemaCompatible(
  schema: JsonSchema,
  path = "$",
): void {
  for (const keyword of OPENAI_STRUCTURED_OUTPUT_UNSUPPORTED_KEYWORDS) {
    if (keyword in schema) {
      throw new Error(
        `OpenAI structured output schema is not compatible: unsupported keyword "${keyword}" at ${path}.`,
      );
    }
  }

  for (const [key, value] of Object.entries(schema)) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (entry && typeof entry === "object") {
          assertOpenAiStructuredOutputSchemaCompatible(
            entry as JsonSchema,
            `${path}.${key}[${index}]`,
          );
        }
      });
      continue;
    }

    if (value && typeof value === "object") {
      assertOpenAiStructuredOutputSchemaCompatible(
        value as JsonSchema,
        `${path}.${key}`,
      );
    }
  }
}

export function getOpenAiStructuredOutputSchema(
  schemaName: GenerateJsonArgs["schemaName"],
): JsonSchema {
  const schema = getSchema(schemaName);

  /**
   * Provider-compatibility decision:
   * we currently keep the canonical TopicAuthoringDraft schema, including `oneOf`,
   * for OpenAI structured outputs. Runtime validation still re-checks the parsed
   * result with the canonical TopicAuthoringDraft validator after parsing.
   */
  assertOpenAiStructuredOutputSchemaCompatible(schema);
  return schema;
}

function getSchema(schemaName: GenerateJsonArgs["schemaName"]): JsonSchema {
  switch (schemaName) {
    case "CoursePlan":
      return {
        type: "object",
        additionalProperties: false,
        required: ["subjectSlug", "profileId", "modules"],
        properties: {
          subjectSlug: { type: "string" },
          profileId: { type: "string" },
          modules: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "moduleSlug",
                "prefix",
                "order",
                "title",
                "description",
                "weekStart",
                "weekEnd",
                "sections"
              ],
              properties: {
                moduleSlug: { type: "string" },
                prefix: { type: "string" },
                order: { type: "number" },
                title: { type: "string" },
                description: { type: ["string", "null"] },
                weekStart: { type: ["number", "null"] },
                weekEnd: { type: ["number", "null"] },
                sections: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "sectionSlug",
                      "order",
                      "title",
                      "description",
                      "topics"
                    ],
                    properties: {
                      sectionSlug: { type: "string" },
                      order: { type: "number" },
                      title: { type: "string" },
                      description: { type: ["string", "null"] },
                      topics: {
                        type: "array",
                        minItems: 1,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: [
                            "topicId",
                            "order",
                            "title",
                            "summary",
                            "minutes",
                            "learningGoals"
                          ],
                          properties: {
                            topicId: { type: "string" },
                            order: { type: "number" },
                            title: { type: "string" },
                            summary: { type: "string" },
                            minutes: { type: "number" },
                            learningGoals: {
                              type: "array",
                              items: { type: "string" }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };
    case "TopicAuthoringDraft":
      return TOPIC_AUTHORING_DRAFT_JSON_SCHEMA;

    case "NormalizedPlanRepair":
      return {
        type: "object",
        additionalProperties: false,
        required: ["repairedPlan", "warnings"],
        properties: {
          repairedPlan: {
            type: "object",
            additionalProperties: true
          },
          warnings: {
            type: "array",
            items: { type: "string" }
          }
        }
      };

    case "TranslatedEntries":
      return {
        type: "object",
        additionalProperties: false,
        required: ["entries"],
        properties: {
          entries: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "value"],
              properties: {
                key: { type: "string" },
                value: { type: "string" }
              }
            }
          }
        }
      };

    default:
      throw new Error(`No strict schema registered for ${schemaName}`);
  }
}
function useStrictSchema(schemaName: GenerateJsonArgs["schemaName"]) {
  return (
      schemaName === "CoursePlan" ||
      schemaName === "NormalizedPlanRepair" ||
      schemaName === "TopicAuthoringDraft" ||
      schemaName === "TranslatedEntries"
  );
}

function getTextFromCompletion(response: any): string {
  const choice = response?.choices?.[0];
  const message = choice?.message;

  if (!message) {
    throw new Error("No message returned from OpenAI");
  }

  if (typeof message.refusal === "string" && message.refusal.trim()) {
    throw new Error(`OpenAI refused the request: ${message.refusal}`);
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    const text = message.content
        .filter((part: any) => part?.type === "text")
        .map((part: any) => part.text ?? "")
        .join("");

    if (text.trim()) return text;
  }

  throw new Error("OpenAI returned no text content");
}

export const openAiProvider: AiProvider = {
  async generateJsonDetailed<T>(
    args: GenerateJsonArgs,
  ): Promise<GeneratedJsonResult<T>> {
    const client = createClient();
    const model = getModel();
    const strictSchema = useStrictSchema(args.schemaName);
    const metadata = {
      provider: "openai",
      model,
      temperature: OPENAI_DEFAULT_TEMPERATURE,
      seed: OPENAI_DETERMINISTIC_SEED,
      schemaName: args.schemaName,
      strictSchema,
    } as const;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "developer", content: args.system },
        { role: "user", content: args.user },
      ],
      response_format: strictSchema
          ? {
            type: "json_schema",
            json_schema: {
              name: args.schemaName,
              strict: true,
              schema: getOpenAiStructuredOutputSchema(args.schemaName),
            },
          }
          : {
            type: "json_object",
          },
      temperature: OPENAI_DEFAULT_TEMPERATURE,
      seed: OPENAI_DETERMINISTIC_SEED,
    });

    const text = getTextFromCompletion(response);
    let parsedJson: unknown;

    try {
      parsedJson = parseJsonText<unknown>(text);
    } catch (error) {
      throw new GeneratedJsonError({
        code: "INVALID_JSON_OUTPUT",
        message: error instanceof Error ? error.message : String(error),
        metadata,
        rawText: text,
        cause: error,
      });
    }

    const validationErrors = getRuntimeValidationErrors(args.schemaName, parsedJson);
    if (validationErrors.length > 0) {
      throw new GeneratedJsonError({
        code: "SCHEMA_VALIDATION_FAILED",
        message: validationErrors.join("\n"),
        metadata,
        rawText: text,
        parsedJson,
        validationErrors,
      });
    }

    return {
      ...metadata,
      rawText: text,
      parsedJson,
      value: parsedJson as T,
    };
  },

  async generateJson<T>(args: GenerateJsonArgs): Promise<T> {
    const result = await openAiProvider.generateJsonDetailed!<T>(args);
    return result.value;
  },
};
