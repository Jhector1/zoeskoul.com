/**
 * Provider-neutral contracts for ZoeBuild.
 *
 * Keep vendor SDK types (Cloudflare, Neon, Stripe, Expo, Docker, etc.) out of
 * this package. Product/domain code can depend on these contracts while
 * infrastructure adapters remain replaceable.
 */

export const BUILD_SPEC_VERSION = 1 as const;

export const BUILD_TARGETS = ["web", "ios", "android"] as const;
export type BuildTarget = (typeof BUILD_TARGETS)[number];

export const BUILD_PROJECT_TYPES = [
  "static-site",
  "frontend-app",
  "fullstack-app",
  "mobile-app",
] as const;
export type BuildProjectType = (typeof BUILD_PROJECT_TYPES)[number];

export const BUILD_CAPABILITIES = [
  "backend",
  "database",
  "auth",
  "storage",
  "payments",
  "email",
  "commerce",
] as const;
export type BuildCapability = (typeof BUILD_CAPABILITIES)[number];

export type BuildRequirements = Readonly<{
  backend: boolean;
  database: boolean;
  auth: boolean;
  storage: boolean;
  payments: boolean;
  email: boolean;
  commerce: boolean;
}>;

export const BUILD_DEPLOYMENT_PREFERENCES = [
  "static",
  "managed-runtime",
  "mobile-cloud",
] as const;

export type BuildDeploymentPreference =
  (typeof BUILD_DEPLOYMENT_PREFERENCES)[number];

export const BUILD_STOREFRONT_RUNTIMES = [
  "static",
  "react-vite",
] as const;

export type BuildStorefrontRuntime =
  (typeof BUILD_STOREFRONT_RUNTIMES)[number];

export type BuildCommerceSpecification = Readonly<{
  storefrontRuntime: BuildStorefrontRuntime;
}>;

export const BUILD_COMMERCE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    storefrontRuntime: {
      type: "string",
      enum: [...BUILD_STOREFRONT_RUNTIMES],
    },
  },
  required: [
    "storefrontRuntime",
  ],
} as const;


/**
 * Presentation-only design contract for ZoeBuild.
 *
 * Models may choose these bounded values. They never receive a surface for
 * arbitrary HTML, CSS, JavaScript, provider configuration, credentials,
 * commerce mechanics, or application architecture.
 */
export const BUILD_DESIGN_STYLES = [
  "minimal",
  "editorial",
  "bold",
  "luxury",
  "playful",
  "technical",
] as const;

export type BuildDesignStyle =
  (typeof BUILD_DESIGN_STYLES)[number];

export const BUILD_DESIGN_HERO_LAYOUTS = [
  "split",
  "centered",
  "editorial",
] as const;

export type BuildDesignHeroLayout =
  (typeof BUILD_DESIGN_HERO_LAYOUTS)[number];

export const BUILD_DESIGN_PRODUCT_DENSITIES = [
  "compact",
  "comfortable",
  "airy",
] as const;

export type BuildDesignProductDensity =
  (typeof BUILD_DESIGN_PRODUCT_DENSITIES)[number];

export const BUILD_DESIGN_CARD_TREATMENTS = [
  "soft",
  "sharp",
  "minimal",
] as const;

export type BuildDesignCardTreatment =
  (typeof BUILD_DESIGN_CARD_TREATMENTS)[number];

export type BuildDesignPalette = Readonly<{
  surface: string;
  surfaceSoft: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentContrast: string;
  artStart: string;
  artEnd: string;
}>;

export type BuildDesignLayout = Readonly<{
  hero: BuildDesignHeroLayout;
  productDensity: BuildDesignProductDensity;
  cardTreatment: BuildDesignCardTreatment;
}>;

export type BuildDesignContent = Readonly<{
  brandName: string;
  eyebrow: string;
  heroTitle: string;
  heroBody: string;
  heroCta: string;
  featuredHeading: string;
  storyHeading: string;
  storyBody: string;
}>;

export type BuildDesignSpecificationV1 = Readonly<{
  version: 1;
  style: BuildDesignStyle;
  palette: BuildDesignPalette;
  layout: BuildDesignLayout;
  content: BuildDesignContent;
}>;

export type BuildDesignSpecification =
  BuildDesignSpecificationV1;

export const BUILD_DESIGN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,

  properties: {
    version: {
      type: "integer",
      const: 1,
    },

    style: {
      type: "string",
      enum: [
        ...BUILD_DESIGN_STYLES,
      ],
    },

    palette: {
      type: "object",
      additionalProperties: false,

      properties: {
        surface: {
          type: "string",
          pattern:
            "^#[0-9A-Fa-f]{6}$",
        },

        surfaceSoft: {
          type: "string",
          pattern:
            "^#[0-9A-Fa-f]{6}$",
        },

        text: {
          type: "string",
          pattern:
            "^#[0-9A-Fa-f]{6}$",
        },

        muted: {
          type: "string",
          pattern:
            "^#[0-9A-Fa-f]{6}$",
        },

        border: {
          type: "string",
          pattern:
            "^#[0-9A-Fa-f]{6}$",
        },

        accent: {
          type: "string",
          pattern:
            "^#[0-9A-Fa-f]{6}$",
        },

        accentContrast: {
          type: "string",
          pattern:
            "^#[0-9A-Fa-f]{6}$",
        },

        artStart: {
          type: "string",
          pattern:
            "^#[0-9A-Fa-f]{6}$",
        },

        artEnd: {
          type: "string",
          pattern:
            "^#[0-9A-Fa-f]{6}$",
        },
      },

      required: [
        "surface",
        "surfaceSoft",
        "text",
        "muted",
        "border",
        "accent",
        "accentContrast",
        "artStart",
        "artEnd",
      ],
    },

    layout: {
      type: "object",
      additionalProperties: false,

      properties: {
        hero: {
          type: "string",
          enum: [
            ...BUILD_DESIGN_HERO_LAYOUTS,
          ],
        },

        productDensity: {
          type: "string",
          enum: [
            ...BUILD_DESIGN_PRODUCT_DENSITIES,
          ],
        },

        cardTreatment: {
          type: "string",
          enum: [
            ...BUILD_DESIGN_CARD_TREATMENTS,
          ],
        },
      },

      required: [
        "hero",
        "productDensity",
        "cardTreatment",
      ],
    },

    content: {
      type: "object",
      additionalProperties: false,

      properties: {
        brandName: {
          type: "string",
          minLength: 1,
          maxLength: 80,
        },

        eyebrow: {
          type: "string",
          minLength: 1,
          maxLength: 80,
        },

        heroTitle: {
          type: "string",
          minLength: 1,
          maxLength: 160,
        },

        heroBody: {
          type: "string",
          minLength: 1,
          maxLength: 320,
        },

        heroCta: {
          type: "string",
          minLength: 1,
          maxLength: 60,
        },

        featuredHeading: {
          type: "string",
          minLength: 1,
          maxLength: 120,
        },

        storyHeading: {
          type: "string",
          minLength: 1,
          maxLength: 160,
        },

        storyBody: {
          type: "string",
          minLength: 1,
          maxLength: 420,
        },
      },

      required: [
        "brandName",
        "eyebrow",
        "heroTitle",
        "heroBody",
        "heroCta",
        "featuredHeading",
        "storyHeading",
        "storyBody",
      ],
    },
  },

  required: [
    "version",
    "style",
    "palette",
    "layout",
    "content",
  ],
} as const;


export type ProjectSpecificationV1 = Readonly<{
  version: typeof BUILD_SPEC_VERSION;
  name: string;
  projectType: BuildProjectType;
  targets: readonly BuildTarget[];
  requirements: BuildRequirements;
  pages: readonly string[];
  stackId: string;

  /**
   * Required whenever requirements.commerce is true.
   * Non-commerce projects may omit it or use null.
   */
  commerce?: BuildCommerceSpecification | null;

  design?: BuildDesignSpecification | null;

  deployment: Readonly<{
    preference: BuildDeploymentPreference;
  }>;
}>;

export type ProjectSpecification = ProjectSpecificationV1;

export type BuildArtifactDefinition = Readonly<{
  type: "static-directory";
  outputPath: string;
}>;

export type BuildStackDefinition = Readonly<{
  id: string;
  projectTypes: readonly BuildProjectType[];
  targets: readonly BuildTarget[];
  runtimeProfileId: string;
  templateId: string;
  commerceRuntime?: BuildStorefrontRuntime | null;
  commands: Readonly<{
    install?: readonly string[];
    dev?: readonly string[];
    build: readonly string[];
    test?: readonly string[];
  }>;
  preview: Readonly<
    | { type: "static" }
    | { type: "server"; port: number }
  >;
  artifact?: BuildArtifactDefinition;
  supportedCapabilities: readonly BuildCapability[];
  deploymentAdapterId: string;
}>;

export function requiredCapabilities(
  specification: Pick<ProjectSpecification, "requirements">,
): BuildCapability[] {
  return BUILD_CAPABILITIES.filter(
    (capability) => specification.requirements[capability],
  );
}

export function requiresManagedBackend(
  specification: Pick<ProjectSpecification, "requirements">,
): boolean {
  const { requirements } = specification;
  return (
    requirements.backend ||
    requirements.database ||
    requirements.auth ||
    requirements.storage ||
    requirements.payments ||
    requirements.email ||
    requirements.commerce
  );
}

/**
 * Runtime boundary validation for untrusted ZoeBuild project specifications.
 *
 * The TypeScript type protects trusted callers at compile time; this parser
 * protects HTTP/AI/import boundaries at runtime and returns a canonical v1
 * specification with unknown fields discarded.
 */
export const BUILD_SPEC_LIMITS = {
  nameChars: 120,
  stackIdChars: 80,
  pages: 100,
  pageChars: 120,
} as const;

const BUILD_REQUIREMENT_JSON_SCHEMA_PROPERTIES =
  Object.fromEntries(
    BUILD_CAPABILITIES.map((capability) => [
      capability,
      { type: "boolean" as const },
    ]),
  ) as Record<
    BuildCapability,
    Readonly<{ type: "boolean" }>
  >;

/**
 * Provider-neutral JSON Schema for AI generation.
 *
 * This schema constrains generation but does not replace
 * parseProjectSpecification(), which remains the authoritative runtime
 * validator for untrusted AI/import/HTTP input.
 *
 * Keep this schema within the JSON Schema subset supported by our
 * structured-output providers.
 */
const PROJECT_SPECIFICATION_BASE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: {
      type: "integer",
      enum: [BUILD_SPEC_VERSION],
    },
    name: {
      type: "string",
    },
    projectType: {
      type: "string",
      enum: [...BUILD_PROJECT_TYPES],
    },
    targets: {
      type: "array",
      minItems: 1,
      maxItems: BUILD_TARGETS.length,
      items: {
        type: "string",
        enum: [...BUILD_TARGETS],
      },
    },
    requirements: {
      type: "object",
      additionalProperties: false,
      properties:
        BUILD_REQUIREMENT_JSON_SCHEMA_PROPERTIES,
      required: [...BUILD_CAPABILITIES],
    },
    pages: {
      type: "array",
      maxItems: BUILD_SPEC_LIMITS.pages,
      items: {
        type: "string",
      },
    },
    stackId: {
      type: "string",
    },
    commerce: {
      anyOf: [
        BUILD_COMMERCE_JSON_SCHEMA,
        {
          type: "null",
        },
      ],
    },
    deployment: {
      type: "object",
      additionalProperties: false,
      properties: {
        preference: {
          type: "string",
          enum: [...BUILD_DEPLOYMENT_PREFERENCES],
        },
      },
      required: ["preference"],
    },
  },
  required: [
    "version",
    "name",
    "projectType",
    "targets",
    "requirements",
    "pages",
    "stackId",
    "deployment",
  ],
} as const satisfies Readonly<Record<string, unknown>>;

export const PROJECT_SPECIFICATION_JSON_SCHEMA = {
  ...PROJECT_SPECIFICATION_BASE_JSON_SCHEMA,

  properties: {
    ...PROJECT_SPECIFICATION_BASE_JSON_SCHEMA.properties,

    design: {
      anyOf: [
        BUILD_DESIGN_JSON_SCHEMA,
        {
          type: "null",
        },
      ],
    },
  },
} as const;


export class BuildSpecificationError extends Error {
  readonly code = "BUILD_SPEC_INVALID" as const;

  constructor(readonly issues: readonly string[]) {
    super(issues.length ? issues.join(" ") : "Invalid ZoeBuild project specification.");
    this.name = "BuildSpecificationError";
  }
}

function asBuildRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedBoundedString(
  value: unknown,
  label: string,
  maxChars: number,
  issues: string[],
): string {
  if (typeof value !== "string") {
    issues.push(`${label} must be a string.`);
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    issues.push(`${label} is required.`);
    return "";
  }
  if (normalized.length > maxChars) {
    issues.push(`${label} must be at most ${maxChars} characters.`);
  }
  return normalized;
}

export function parseProjectSpecification(value: unknown): ProjectSpecification {
  const input = asBuildRecord(value);
  if (!input) {
    throw new BuildSpecificationError(["Project specification must be an object."]);
  }

  const issues: string[] = [];

  if (input.version !== BUILD_SPEC_VERSION) {
    issues.push(`Project specification version must be ${BUILD_SPEC_VERSION}.`);
  }

  const name = normalizedBoundedString(
    input.name,
    "Project name",
    BUILD_SPEC_LIMITS.nameChars,
    issues,
  );

  const projectType =
    typeof input.projectType === "string" &&
    (BUILD_PROJECT_TYPES as readonly string[]).includes(input.projectType)
      ? (input.projectType as BuildProjectType)
      : null;
  if (!projectType) {
    issues.push("Project type is not supported.");
  }

  const targets: BuildTarget[] = [];
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    issues.push("At least one build target is required.");
  } else {
    const seen = new Set<string>();
    for (const rawTarget of input.targets) {
      if (
        typeof rawTarget !== "string" ||
        !(BUILD_TARGETS as readonly string[]).includes(rawTarget)
      ) {
        issues.push("Build target is not supported.");
        continue;
      }
      if (seen.has(rawTarget)) {
        issues.push(`Duplicate build target: ${rawTarget}.`);
        continue;
      }
      seen.add(rawTarget);
      targets.push(rawTarget as BuildTarget);
    }
  }

  const requirementInput = asBuildRecord(input.requirements);
  const requirementValues = {} as Record<BuildCapability, boolean>;
  if (!requirementInput) {
    issues.push("Build requirements must be an object.");
    for (const capability of BUILD_CAPABILITIES) {
      requirementValues[capability] = false;
    }
  } else {
    for (const capability of BUILD_CAPABILITIES) {
      const raw = requirementInput[capability];
      if (typeof raw !== "boolean") {
        issues.push(`Requirement ${capability} must be boolean.`);
        requirementValues[capability] = false;
      } else {
        requirementValues[capability] = raw;
      }
    }
  }

  const pages: string[] = [];
  if (!Array.isArray(input.pages)) {
    issues.push("Pages must be an array.");
  } else {
    if (input.pages.length > BUILD_SPEC_LIMITS.pages) {
      issues.push(`Pages may contain at most ${BUILD_SPEC_LIMITS.pages} entries.`);
    }
    const seenPages = new Set<string>();
    for (const rawPage of input.pages.slice(0, BUILD_SPEC_LIMITS.pages)) {
      const page = normalizedBoundedString(
        rawPage,
        "Page name",
        BUILD_SPEC_LIMITS.pageChars,
        issues,
      );
      if (!page) continue;
      if (seenPages.has(page)) {
        issues.push(`Duplicate page: ${page}.`);
        continue;
      }
      seenPages.add(page);
      pages.push(page);
    }
  }

  const stackId = normalizedBoundedString(
    input.stackId,
    "Stack id",
    BUILD_SPEC_LIMITS.stackIdChars,
    issues,
  );

  const commerceProvided =
    Object.prototype.hasOwnProperty.call(
      input,
      "commerce",
    );

  let commerce:
    BuildCommerceSpecification |
    null |
    undefined;

  if (commerceProvided) {
    if (input.commerce === null) {
      commerce = null;
    } else {
      const commerceInput =
        asBuildRecord(
          input.commerce,
        );

      if (!commerceInput) {
        issues.push(
          "Commerce specification must be an object or null.",
        );
      } else {
        const storefrontRuntime =
          typeof commerceInput.storefrontRuntime === "string" &&
          (
            BUILD_STOREFRONT_RUNTIMES as readonly string[]
          ).includes(
            commerceInput.storefrontRuntime,
          )
            ? commerceInput.storefrontRuntime as BuildStorefrontRuntime
            : null;

        if (!storefrontRuntime) {
          issues.push(
            "Storefront runtime is not supported.",
          );
        }

        if (storefrontRuntime) {
          commerce = {
            storefrontRuntime,
          };
        }
      }
    }
  }

  if (
    requirementValues.commerce &&
    !commerce
  ) {
    issues.push(
      "Commerce projects require a storefront runtime.",
    );
  }

  if (
    !requirementValues.commerce &&
    commerce
  ) {
    issues.push(
      "Non-commerce projects cannot declare a commerce plan.",
    );
  }

  const designProvided =
    Object.prototype.hasOwnProperty.call(
      input,
      "design",
    );

  let design:
    BuildDesignSpecification |
    null |
    undefined;

  if (designProvided) {
    if (input.design === null) {
      design = null;
    } else {
      try {
        design =
          parseBuildDesignSpecification(
            input.design,
          );
      } catch (error) {
        if (
          error instanceof
          BuildDesignSpecificationError
        ) {
          issues.push(
            ...error.issues,
          );
        } else {
          throw error;
        }
      }
    }
  }

  const deploymentInput = asBuildRecord(input.deployment);
  const deploymentPreference = deploymentInput?.preference;
  const validDeploymentPreference =
    typeof deploymentPreference === "string" &&
    (
      BUILD_DEPLOYMENT_PREFERENCES as readonly string[]
    ).includes(deploymentPreference)
      ? (deploymentPreference as BuildDeploymentPreference)
      : null;
  if (!validDeploymentPreference) {
    issues.push("Deployment preference is not supported.");
  }

  if (issues.length || !projectType || !validDeploymentPreference) {
    throw new BuildSpecificationError(issues);
  }

  return {
    version: BUILD_SPEC_VERSION,
    name,
    projectType,
    targets,
    requirements: requirementValues,
    pages,
    stackId,

    ...(commerceProvided || commerce
      ? {
          commerce:
            commerce ?? null,
        }
      : {}),

    ...(designProvided
      ? {
          design:
            design ?? null,
        }
      : {}),

    deployment: {
      preference: validDeploymentPreference,
    },
  };
}

export class BuildDesignSpecificationError
  extends Error {
  readonly code =
    "BUILD_DESIGN_INVALID" as const;

  constructor(
    readonly issues:
      readonly string[],
  ) {
    super(
      issues.length
        ? issues.join(" ")
        : "Invalid ZoeBuild design specification.",
    );

    this.name =
      "BuildDesignSpecificationError";
  }
}

function designRecord(
  value: unknown,
  label: string,
  issues: string[],
): Record<string, unknown> {
  const record =
    asBuildRecord(value);

  if (!record) {
    issues.push(
      `${label} must be an object.`,
    );

    return {};
  }

  return record;
}

function designEnum<
  T extends string,
>(
  value: unknown,
  allowed:
    readonly T[],
  label: string,
  issues: string[],
): T {
  if (
    typeof value === "string" &&
    allowed.includes(
      value as T,
    )
  ) {
    return value as T;
  }

  issues.push(
    `${label} is not supported.`,
  );

  return allowed[0]!;
}

function designColor(
  value: unknown,
  label: string,
  issues: string[],
): string {
  const normalized =
    normalizedBoundedString(
      value,
      label,
      7,
      issues,
    );

  if (
    normalized &&
    !/^#[0-9A-Fa-f]{6}$/.test(
      normalized,
    )
  ) {
    issues.push(
      `${label} must be a six-digit hex color.`,
    );
  }

  return normalized.toUpperCase();
}

export function parseBuildDesignSpecification(
  value: unknown,
): BuildDesignSpecification {
  const issues: string[] = [];

  const input =
    designRecord(
      value,
      "Design",
      issues,
    );

  if (input.version !== 1) {
    issues.push(
      "Design version must be 1.",
    );
  }

  const style =
    designEnum(
      input.style,
      BUILD_DESIGN_STYLES,
      "Design style",
      issues,
    );

  const paletteInput =
    designRecord(
      input.palette,
      "Design palette",
      issues,
    );

  const palette:
    BuildDesignPalette = {
      surface:
        designColor(
          paletteInput.surface,
          "Design surface",
          issues,
        ),

      surfaceSoft:
        designColor(
          paletteInput.surfaceSoft,
          "Design soft surface",
          issues,
        ),

      text:
        designColor(
          paletteInput.text,
          "Design text",
          issues,
        ),

      muted:
        designColor(
          paletteInput.muted,
          "Design muted text",
          issues,
        ),

      border:
        designColor(
          paletteInput.border,
          "Design border",
          issues,
        ),

      accent:
        designColor(
          paletteInput.accent,
          "Design accent",
          issues,
        ),

      accentContrast:
        designColor(
          paletteInput.accentContrast,
          "Design accent contrast",
          issues,
        ),

      artStart:
        designColor(
          paletteInput.artStart,
          "Design art start",
          issues,
        ),

      artEnd:
        designColor(
          paletteInput.artEnd,
          "Design art end",
          issues,
        ),
    };

  const layoutInput =
    designRecord(
      input.layout,
      "Design layout",
      issues,
    );

  const layout:
    BuildDesignLayout = {
      hero:
        designEnum(
          layoutInput.hero,
          BUILD_DESIGN_HERO_LAYOUTS,
          "Design hero layout",
          issues,
        ),

      productDensity:
        designEnum(
          layoutInput.productDensity,
          BUILD_DESIGN_PRODUCT_DENSITIES,
          "Design product density",
          issues,
        ),

      cardTreatment:
        designEnum(
          layoutInput.cardTreatment,
          BUILD_DESIGN_CARD_TREATMENTS,
          "Design card treatment",
          issues,
        ),
    };

  const contentInput =
    designRecord(
      input.content,
      "Design content",
      issues,
    );

  const content:
    BuildDesignContent = {
      brandName:
        normalizedBoundedString(
          contentInput.brandName,
          "Design brand name",
          80,
          issues,
        ),

      eyebrow:
        normalizedBoundedString(
          contentInput.eyebrow,
          "Design eyebrow",
          80,
          issues,
        ),

      heroTitle:
        normalizedBoundedString(
          contentInput.heroTitle,
          "Design hero title",
          160,
          issues,
        ),

      heroBody:
        normalizedBoundedString(
          contentInput.heroBody,
          "Design hero body",
          320,
          issues,
        ),

      heroCta:
        normalizedBoundedString(
          contentInput.heroCta,
          "Design hero CTA",
          60,
          issues,
        ),

      featuredHeading:
        normalizedBoundedString(
          contentInput.featuredHeading,
          "Design featured heading",
          120,
          issues,
        ),

      storyHeading:
        normalizedBoundedString(
          contentInput.storyHeading,
          "Design story heading",
          160,
          issues,
        ),

      storyBody:
        normalizedBoundedString(
          contentInput.storyBody,
          "Design story body",
          420,
          issues,
        ),
    };

  if (issues.length) {
    throw new BuildDesignSpecificationError(
      issues,
    );
  }

  return {
    version: 1,
    style,
    palette,
    layout,
    content,
  };
}
