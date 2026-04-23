import OpenAI from "openai";
import type { AiProvider, GenerateJsonArgs } from "../types.js";

type JsonSchema = Record<string, unknown>;

function getEnv(name: "OPENAI_API_KEY" | "OPENAI_MODEL"): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function createClient() {
  return new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
}

function getModel(): string {
  return getEnv("OPENAI_MODEL");
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
    // case "TopicAuthoringDraft":
    //   return {
    //     type: "object",
    //     additionalProperties: false,
    //     required: ["title", "summary", "minutes", "sketchBlocks", "quizDraft"],
    //     properties: {
    //       title: { type: "string" },
    //       summary: { type: "string" },
    //       minutes: { type: "number" },
    //       sketchBlocks: {
    //         type: "array",
    //         items: {
    //           type: "object",
    //           additionalProperties: false,
    //           required: ["id", "title", "bodyMarkdown"],
    //           properties: {
    //             id: { type: "string" },
    //             title: { type: "string" },
    //             bodyMarkdown: { type: "string" },
    //           },
    //         },
    //       },
    //       quizDraft: {
    //         type: "array",
    //         items: {
    //           type: "object",
    //           additionalProperties: false,
    //           required: ["id", "kind", "title", "prompt"],
    //           properties: {
    //             id: { type: "string" },
    //             kind: {
    //               type: "string",
    //               enum: [
    //                 "single_choice",
    //                 "multi_choice",
    //                 "drag_reorder",
    //                 "fill_blank_choice",
    //                 "code_input",
    //               ],
    //             },
    //             title: { type: "string" },
    //             prompt: { type: "string" },
    //
    //             options: {
    //               type: "array",
    //               items: { type: "string" },
    //             },
    //             correctOptionIds: {
    //               type: "array",
    //               items: { type: "string" },
    //             },
    //
    //             tokens: {
    //               type: "array",
    //               items: { type: "string" },
    //             },
    //             correctOrder: {
    //               type: "array",
    //               items: { type: "string" },
    //             },
    //
    //             template: { type: "string" },
    //             choices: {
    //               type: "array",
    //               items: { type: "string" },
    //             },
    //             correctValue: { type: "string" },
    //
    //             starterCode: { type: "string" },
    //             solutionCode: { type: "string" },
    //             datasetId: { type: "string" },
    //             recipeType: {
    //               type: "string",
    //               enum: ["sql_query", "template_io", "fixed_tests"],
    //             },
    //
    //             hint: { type: "string" },
    //             concept: { type: "string" },
    //             hint1: { type: "string" },
    //             hint2: { type: "string" },
    //           },
    //         },
    //       },
    //       projectDraft: {
    //         type: "object",
    //         additionalProperties: false,
    //         required: ["title", "stepIds"],
    //         properties: {
    //           title: { type: "string" },
    //           stepIds: {
    //             type: "array",
    //             items: { type: "string" },
    //           },
    //         },
    //       },
    //     },
    //   };

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
      // schemaName === "TopicAuthoringDraft" ||
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
  async generateJson<T>(args: GenerateJsonArgs): Promise<T> {
    const client = createClient();
    const model = getModel();

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "developer", content: args.system },
        { role: "user", content: args.user },
      ],
      response_format: useStrictSchema(args.schemaName)
          ? {
            type: "json_schema",
            json_schema: {
              name: args.schemaName,
              strict: true,
              schema: getSchema(args.schemaName),
            },
          }
          : {
            type: "json_object",
          },
      temperature: 0.2,
    });

    const text = getTextFromCompletion(response);
    return parseJsonText<T>(text);
  },
};