import {
  BUILD_COMMERCE_JSON_SCHEMA,
  BUILD_DESIGN_JSON_SCHEMA,
  BuildSpecificationError,
  parseProjectSpecification,
  PROJECT_SPECIFICATION_JSON_SCHEMA,
  type ProjectSpecification,
} from "@zoeskoul/build-contracts";
import {
  evaluateProjectStack,
} from "@zoeskoul/build-core";
import {
  listBuildStacks,
  requireBuildStack,
} from "@zoeskoul/build-registry";

export const BUILD_AI_PROMPT_LIMITS = {
  promptChars: 12_000,
} as const;

export type BuildAiGenerationMetadata = Readonly<{
  provider: string;
  model: string;
}>;

export type BuildAiPlannerResult = Readonly<{
  specification: unknown;
  metadata: BuildAiGenerationMetadata;
}>;

export type BuildPromptMedia =
  import("@zoeskoul/ai-json").AiJsonMediaInput;

export interface BuildAiPlanner {
  generateProjectSpecification(input: Readonly<{
    prompt: string;
    media?: readonly BuildPromptMedia[];
    maxOutputTokens?: number;
  }>): Promise<BuildAiPlannerResult>;
}

export type PlanBuildProjectFromPromptResult = Readonly<{
  specification: ProjectSpecification;
  metadata: BuildAiGenerationMetadata;
}>;

export class BuildAiPlanningError extends Error {
  readonly code:
    | "BUILD_AI_PROMPT_INVALID"
    | "BUILD_AI_SPEC_INVALID"
    | "BUILD_AI_STACK_INCOMPATIBLE";

  constructor(
    code: BuildAiPlanningError["code"],
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = "BuildAiPlanningError";
    this.code = code;
  }
}

function normalizePrompt(
  value: unknown,
  media: readonly BuildPromptMedia[] = [],
): string {
  if (
    typeof value !== "string" &&
    value !== undefined &&
    value !== null
  ) {
    throw new BuildAiPlanningError(
      "BUILD_AI_PROMPT_INVALID",
      "ZoeBuild prompt text must be a string.",
    );
  }

  const prompt =
    typeof value === "string"
      ? value.trim()
      : "";

  if (!prompt && media.length === 0) {
    throw new BuildAiPlanningError(
      "BUILD_AI_PROMPT_INVALID",
      "Add text, an image, a video, or voice/audio before building.",
    );
  }

  if (prompt.length > BUILD_AI_PROMPT_LIMITS.promptChars) {
    throw new BuildAiPlanningError(
      "BUILD_AI_PROMPT_INVALID",
      `ZoeBuild prompts may contain at most ${BUILD_AI_PROMPT_LIMITS.promptChars} characters.`,
    );
  }

  return prompt;
}

function validateGeneratedSpecification(
  value: unknown,
): ProjectSpecification {
  let specification: ProjectSpecification;

  try {
    specification =
      parseProjectSpecification(value);
  } catch (error) {
    if (error instanceof BuildSpecificationError) {
      throw new BuildAiPlanningError(
        "BUILD_AI_SPEC_INVALID",
        "AI returned an invalid ZoeBuild project specification.",
        [...error.issues],
      );
    }

    throw error;
  }

  const stack =
    requireBuildStack(specification.stackId);
  const compatibility =
    evaluateProjectStack(specification, stack);

  if (!compatibility.compatible) {
    throw new BuildAiPlanningError(
      "BUILD_AI_STACK_INCOMPATIBLE",
      "AI selected a stack that cannot satisfy the generated project specification.",
      compatibility.issues.map(
        (issue) => issue.message,
      ),
    );
  }

  return specification;
}

/**
 * Provider-neutral prompt planning boundary.
 *
 * An AI adapter may propose only a ProjectSpecification. It cannot persist
 * source, pick an unregistered runtime, execute code, provision resources,
 * or bypass the canonical Build specification parser.
 */
export async function planBuildProjectFromPrompt(
  input: Readonly<{
    prompt: unknown;
    media?: readonly BuildPromptMedia[];
    planner: BuildAiPlanner;
    maxOutputTokens?: number;
  }>,
): Promise<PlanBuildProjectFromPromptResult> {
  const media =
    input.media ?? [];
  const prompt =
    normalizePrompt(
      input.prompt,
      media,
    );
  const generated =
    await input.planner.generateProjectSpecification({
      prompt,
      media,
      maxOutputTokens: input.maxOutputTokens,
    });

  const provider =
    generated.metadata.provider.trim();
  const model =
    generated.metadata.model.trim();

  if (!provider || !model) {
    throw new BuildAiPlanningError(
      "BUILD_AI_SPEC_INVALID",
      "AI generation metadata is incomplete.",
    );
  }

  return {
    specification:
      validateGeneratedSpecification(
        generated.specification,
      ),
    metadata: {
      provider,
      model,
    },
  };
}

import {
  parseAiJsonText,
  type AiJsonTransport,
} from "@zoeskoul/ai-json";

export const BUILD_PROJECT_SPECIFICATION_SCHEMA_NAME =
  "ProjectSpecification" as const;

const BUILD_AI_REGISTERED_STACKS =
  listBuildStacks();

export const BUILD_AI_REGISTERED_STACK_IDS =
  BUILD_AI_REGISTERED_STACKS.map(
    (stack) => stack.id,
  );

export const BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA = {
  ...PROJECT_SPECIFICATION_JSON_SCHEMA,

  properties: {
    ...PROJECT_SPECIFICATION_JSON_SCHEMA.properties,

    stackId: {
      ...PROJECT_SPECIFICATION_JSON_SCHEMA.properties.stackId,

      enum: [
        ...BUILD_AI_REGISTERED_STACK_IDS,
      ],
    },

    commerce: {
      anyOf: [
        BUILD_COMMERCE_JSON_SCHEMA,
        {
          type: "null",
        },
      ],
    },

    design: {
      anyOf: [
        BUILD_DESIGN_JSON_SCHEMA,
        {
          type: "null",
        },
      ],
    },
  },

  // Structured-output providers require object properties to be explicit.
  // Trusted non-AI callers may continue omitting design.
  required: [
    ...PROJECT_SPECIFICATION_JSON_SCHEMA.required,
    "commerce",
    "design",
  ],
} as const;

const BUILD_AI_REGISTERED_STACK_GUIDANCE =
  BUILD_AI_REGISTERED_STACKS
    .map((stack) => {
      const capabilities =
        stack.supportedCapabilities.length > 0
          ? stack.supportedCapabilities.join(",")
          : "none";

      return [
        stack.id,
        `projectTypes=${stack.projectTypes.join(",")}`,
        `targets=${stack.targets.join(",")}`,
        `capabilities=${capabilities}`,
      ].join(" ");
    })
    .join(" | ");

export const BUILD_AI_PROJECT_SPECIFICATION_SYSTEM_PROMPT = [
  "You are the planning engine for ZoeBuild.",
  "Return exactly one JSON object and no prose.",
  "The object must describe a ProjectSpecification version 1.",
  'Allowed projectType values: "static-site", "frontend-app", "fullstack-app", "mobile-app".',
  'Allowed targets: "web", "ios", "android".',
  "requirements must contain booleans for backend, database, auth, storage, payments, email, and commerce.",
  'commerce must be null for non-commerce work or a bounded object with storefrontRuntime "static" or "react-vite"; commerce provider ownership is resolved server-side and must not appear in the Build specification.',
  "Commerce provider/runtime are architecture metadata and deterministic ZoeBuild planning owns the final values.",
  "pages must be an array of concise page names.",
  `Registered stacks: ${BUILD_AI_REGISTERED_STACK_GUIDANCE}.`,
  "Select stackId only from the registered stacks above.",
  'Allowed deployment.preference values: "static", "managed-runtime", "mobile-cloud".',
  "Do not invent stack identifiers.",
  "Uploaded images, video, and voice/audio are context for understanding what the user wants to build.",
  "design is presentation-only structured data: palette, layout choices, and bounded user-facing copy.",
  "Never put HTML, CSS, JavaScript, executable code, commerce mechanics, authentication logic, provider configuration, or credentials inside design.",
  "For user-facing sites, provide a compact design object when the user supplied enough visual or brand direction; otherwise use design: null.",
  "Do not include source code, secrets, access tokens, provider credentials, or deployment credentials.",
].join("\n");

export function createBuildAiPlannerFromJsonTransport(
  transport: AiJsonTransport,
): BuildAiPlanner {
  return {
    async generateProjectSpecification(
      input,
    ): Promise<BuildAiPlannerResult> {
      const generated =
        await transport.generateJsonText({
          system:
            BUILD_AI_PROJECT_SPECIFICATION_SYSTEM_PROMPT,
          user: input.prompt,
          schemaName:
            BUILD_PROJECT_SPECIFICATION_SCHEMA_NAME,
            responseJsonSchema:
              BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA,
          media:
            input.media,
          maxOutputTokens:
            input.maxOutputTokens,
        });

      let specification: unknown;

      try {
        specification =
          parseAiJsonText<unknown>(
            generated.text,
          );
      } catch (error) {
        throw new BuildAiPlanningError(
          "BUILD_AI_SPEC_INVALID",
          `AI returned invalid ProjectSpecification JSON: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }

      return {
        specification,
        metadata: {
          provider:
            generated.metadata.provider,
          model:
            generated.metadata.model,
        },
      };
    },
  };
}
