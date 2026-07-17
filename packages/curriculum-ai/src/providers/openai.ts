import OpenAI from "openai";

import type {
  AiProvider,
  GenerateJsonArgs,
  GeneratedJsonMetadata,
  GeneratedJsonResult,
} from "../types.js";
import { GeneratedJsonError } from "../types.js";

type JsonSchema = Record<string, unknown>;
const OPENAI_DEFAULT_TEMPERATURE = 0;
const OPENAI_API_DEFAULT_TEMPERATURE = 1;
const OPENAI_DETERMINISTIC_SEED = 0;

function supportsDeterministicSamplingParameters(model: string): boolean {
  // GPT-5-family Chat Completions models accept only their default sampling
  // behavior. Omitting both fields is safer than sending unsupported values.
  return !/^gpt-5(?:[.-]|$)/i.test(model.trim());
}

export type OpenAiProviderOptions = {
  model?: string;
};

const OPENAI_JSON_SCALAR_SCHEMA = {
  type: ["string", "number", "boolean", "null"],
} satisfies JsonSchema;

const OPENAI_JSON_VALUE_SCHEMA_DEPTH_1 = {
  type: ["string", "number", "boolean", "array", "null"],
  items: OPENAI_JSON_SCALAR_SCHEMA,
} satisfies JsonSchema;

const OPENAI_JSON_VALUE_SCHEMA_DEPTH_2 = {
  type: ["string", "number", "boolean", "array", "null"],
  items: OPENAI_JSON_VALUE_SCHEMA_DEPTH_1,
} satisfies JsonSchema;

const OPENAI_JSON_VALUE_SCHEMA_DEPTH_3 = {
  type: ["string", "number", "boolean", "array", "null"],
  items: OPENAI_JSON_VALUE_SCHEMA_DEPTH_2,
} satisfies JsonSchema;

const OPENAI_JSON_VALUE_SCHEMA = OPENAI_JSON_VALUE_SCHEMA_DEPTH_3;

const OPENAI_SEMANTIC_VALUE_KIND_SCHEMA = {
  type: "string",
  enum: ["value", "dict_entries", "list_of_dict_entries"],
} satisfies JsonSchema;

const OPENAI_STRUCTURED_OUTPUT_UNSUPPORTED_KEYWORDS = [
  "oneOf",
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

const OPENAI_COURSE_PLAN_PROJECT_STEP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["step", "title", "requirement"],
  properties: {
    step: { type: "integer" },
    title: { type: "string" },
    requirement: { type: "string" },
  },
} satisfies JsonSchema;

const OPENAI_COURSE_PLAN_PROJECT_BRIEF_SCHEMA = {
  type: ["object", "null"],
  additionalProperties: false,
  required: [
    "scenario",
    "role",
    "workspace",
    "deliverable",
    "stepCountTarget",
    "flow",
    "requirements",
    "stepLadder",
  ],
  properties: {
    scenario: { type: "string" },
    role: { type: "string" },
    workspace: { type: "string" },
    deliverable: { type: "string" },
    stepCountTarget: { type: "integer" },
    flow: { type: "string", enum: ["standalone", "progressive"] },
    requirements: {
      type: "array",
      items: { type: "string" },
    },
    stepLadder: {
      type: "array",
      minItems: 1,
      items: OPENAI_COURSE_PLAN_PROJECT_STEP_SCHEMA,
    },
  },
} satisfies JsonSchema;

const OPENAI_TOPIC_AUTHORING_WORKSPACE_FILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["path", "content", "language", "isEntry", "entry", "readOnly"],
  properties: {
    path: { type: "string", maxLength: 160 },
    content: { type: "string", maxLength: 12_000 },
    language: { type: ["string", "null"] },
    isEntry: { type: ["boolean", "null"] },
    entry: { type: ["boolean", "null"] },
    readOnly: { type: ["boolean", "null"] },
  },
} satisfies JsonSchema;

const OPENAI_TOPIC_AUTHORING_EXERCISE_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "kind",
    "title",
    "prompt",
    "hint",
    "help",
    "options",
    "correctOptionIds",
    "tokens",
    "correctOrder",
    "template",
    "choices",
    "correctValue",
    "starterCode",
    "solutionCode",
    "entryFilePath",
    "starterFiles",
    "solutionFiles",
    "sqlFileOrder",
    "tests",
    "files",
    "semanticChecks",
    "datasetId",
    "recipeType",
    "checkSql",
  ],
  properties: {
    id: { type: "string" },
    kind: {
      type: "string",
      enum: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
      ],
    },
    title: { type: "string" },
    prompt: { type: "string" },
    hint: { type: "string" },
    help: {
      type: "object",
      additionalProperties: false,
      required: ["concept", "hint_1", "hint_2"],
      properties: {
        concept: { type: "string" },
        hint_1: { type: "string" },
        hint_2: { type: "string" },
      },
    },
    options: { type: ["array", "null"], items: { type: "string" } },
    correctOptionIds: { type: ["array", "null"], items: { type: "string" } },
    tokens: { type: ["array", "null"], items: { type: "string" } },
    correctOrder: { type: ["array", "null"], items: { type: "string" } },
    template: { type: ["string", "null"] },
    choices: { type: ["array", "null"], items: { type: "string" } },
    correctValue: { type: ["string", "null"] },
    starterCode: { type: ["string", "null"] },
    solutionCode: { type: ["string", "null"] },
    entryFilePath: { type: ["string", "null"], maxLength: 160 },
    starterFiles: {
      type: ["array", "null"],
      items: OPENAI_TOPIC_AUTHORING_WORKSPACE_FILE_SCHEMA,
    },
    solutionFiles: {
      type: ["array", "null"],
      items: OPENAI_TOPIC_AUTHORING_WORKSPACE_FILE_SCHEMA,
    },
    sqlFileOrder: {
      type: ["array", "null"],
      items: { type: "string", maxLength: 160 },
    },
    tests: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stdin", "stdout", "match", "files"],
        properties: {
          stdin: { type: ["string", "null"] },
          stdout: { type: "string" },
          match: {
            type: ["string", "null"],
            enum: ["exact", "includes", null],
          },
          files: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              required: ["path", "content", "readOnly"],
              properties: {
                path: { type: "string", maxLength: 120 },
                content: { type: "string", maxLength: 600 },
                readOnly: { type: ["boolean", "null"] },
              },
            },
          },
        },
      },
    },
    files: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content", "readOnly"],
        properties: {
          path: { type: "string", maxLength: 120 },
          content: { type: "string", maxLength: 600 },
          readOnly: { type: ["boolean", "null"] },
        },
      },
    },
    semanticChecks: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "functionName",
          "args",
          "argKinds",
          "className",
          "constructorArgs",
          "constructorArgKinds",
          "attributes",
          "methodName",
          "methodArgs",
          "methodArgKinds",
          "calls",
          "attributeName",
          "expected",
          "expectedKind",
          "min",
          "message",
        ],
        properties: {
          type: {
            type: "string",
            enum: [
              "function_returns",
              "defines_class",
              "constructible",
              "instance_attributes",
              "method_returns",
              "method_sequence_returns",
              "attribute_sequence_equals",
              "created_instances",
              "printed_line_count",
              "no_stdout",
            ],
          },
          argKinds: {
            type: ["array", "null"],
            items: OPENAI_SEMANTIC_VALUE_KIND_SCHEMA,
          },

          expectedKind: {
            type: ["string", "null"],
            enum: ["value", "dict_entries", "list_of_dict_entries", null],
          },

          constructorArgKinds: {
            type: ["array", "null"],
            items: OPENAI_SEMANTIC_VALUE_KIND_SCHEMA,
          },

          methodArgKinds: {
            type: ["array", "null"],
            items: OPENAI_SEMANTIC_VALUE_KIND_SCHEMA,
          },

          functionName: { type: ["string", "null"] },
          args: {
            type: ["array", "null"],
            items: OPENAI_JSON_VALUE_SCHEMA,
          },

          className: { type: ["string", "null"] },
          constructorArgs: {
            type: ["array", "null"],
            items: OPENAI_JSON_VALUE_SCHEMA,
          },
          attributes: {
            type: ["array", "null"],
            items: { type: "string" },
          },
          methodName: { type: ["string", "null"] },
          methodArgs: {
            type: ["array", "null"],
            items: OPENAI_JSON_VALUE_SCHEMA,
          },
          attributeName: { type: ["string", "null"] },
          calls: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              required: ["methodName", "methodArgs", "methodArgKinds"],
              properties: {
                methodName: { type: ["string", "null"] },
                methodArgs: {
                  type: ["array", "null"],
                  items: OPENAI_JSON_VALUE_SCHEMA,
                },
                methodArgKinds: {
                  type: ["array", "null"],
                  items: OPENAI_SEMANTIC_VALUE_KIND_SCHEMA,
                },
              },
            },
          },

          expected: OPENAI_JSON_VALUE_SCHEMA,
          min: { type: ["number", "null"] },
          message: { type: ["string", "null"] },
        },
      },
    },
    datasetId: { type: ["string", "null"] },
    recipeType: {
      type: ["string", "null"],
      enum: ["sql_query", "template_io", "fixed_tests", "semantic", null],
    },
    checkSql: { type: ["string", "null"] },
  },
} satisfies JsonSchema;

const OPENAI_TOPIC_AUTHORING_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "minutes", "sketchBlocks", "quizDraft", "projectDraft"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    minutes: { type: "number" },
    sketchBlocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "cardTitle", "title", "bodyMarkdown"],
        properties: {
          id: { type: "string" },
          cardTitle: { type: ["string", "null"] },
          title: { type: "string" },
          bodyMarkdown: { type: "string" },
        },
      },
    },
    quizDraft: {
      type: "array",
      items: OPENAI_TOPIC_AUTHORING_EXERCISE_ITEM_SCHEMA,
    },
    projectDraft: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["title", "stepIds"],
      properties: {
        title: { type: "string" },
        stepIds: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
} satisfies JsonSchema;

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

function stripNullCompatibilityFields(value: unknown): unknown {
  if (value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => stripNullCompatibilityFields(entry))
      .filter((entry) => typeof entry !== "undefined");
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

function normalizeProviderJsonValue(
  schemaName: GenerateJsonArgs["schemaName"],
  value: unknown,
): unknown {
  if (schemaName === "TopicAuthoringDraft") {
    return stripNullCompatibilityFields(value);
  }

  return value;
}
function getRuntimeValidationErrors(
    _schemaName: GenerateJsonArgs["schemaName"],
    _value: unknown,
): string[] {
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
                "role",
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
                role: { type: "string", enum: ["standard", "capstone"] },
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
                      "role",
                      "topics"
                    ],
                    properties: {
                      sectionSlug: { type: "string" },
                      order: { type: "number" },
                      title: { type: "string" },
                      description: { type: ["string", "null"] },
                      role: {
                        type: "string",
                        enum: ["lesson", "module_project", "capstone"]
                      },
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
                            "learningGoals",
                            "projectBrief"
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
                            },
                            projectBrief: OPENAI_COURSE_PLAN_PROJECT_BRIEF_SCHEMA
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
      return OPENAI_TOPIC_AUTHORING_DRAFT_SCHEMA;

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

export function createOpenAiProvider(options: OpenAiProviderOptions = {}): AiProvider {
  const explicitModel = options.model?.trim();

  const provider: AiProvider = {
    providerId: "openai",
    ...(explicitModel ? { model: explicitModel } : {}),

    async generateJsonDetailed<T>(
      args: GenerateJsonArgs,
    ): Promise<GeneratedJsonResult<T>> {
      const client = createClient();
      const model = explicitModel || getModel();
      const strictSchema = useStrictSchema(args.schemaName);
      const deterministicSampling = supportsDeterministicSamplingParameters(model);
      const metadata = {
        provider: "openai",
        model,
        temperature: deterministicSampling
          ? OPENAI_DEFAULT_TEMPERATURE
          : OPENAI_API_DEFAULT_TEMPERATURE,
        ...(deterministicSampling ? { seed: OPENAI_DETERMINISTIC_SEED } : {}),
        schemaName: args.schemaName,
        strictSchema,
      } satisfies GeneratedJsonMetadata;

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
        ...(deterministicSampling
          ? {
              temperature: OPENAI_DEFAULT_TEMPERATURE,
              seed: OPENAI_DETERMINISTIC_SEED,
            }
          : {}),
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

      const normalizedValue = normalizeProviderJsonValue(args.schemaName, parsedJson);
      const validationErrors = getRuntimeValidationErrors(args.schemaName, normalizedValue);
      if (validationErrors.length > 0) {
        throw new GeneratedJsonError({
          code: "SCHEMA_VALIDATION_FAILED",
          message: validationErrors.join("\n"),
          metadata,
          rawText: text,
          parsedJson: normalizedValue,
          validationErrors,
        });
      }

      return {
        ...metadata,
        rawText: text,
        parsedJson,
        value: normalizedValue as T,
      };
    },

    async generateJson<T>(args: GenerateJsonArgs): Promise<T> {
      const result = await provider.generateJsonDetailed!<T>(args);
      return result.value;
    },
  };

  return provider;
}

export const openAiProvider: AiProvider = createOpenAiProvider();
