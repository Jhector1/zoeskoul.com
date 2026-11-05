import type {
  BuildCommerceSpecification,
  BuildDeploymentPreference,
  BuildProjectType,
  BuildRequirements,
  BuildTarget,
} from "@zoeskoul/build-contracts";

export const BUILD_SITE_KINDS = [
  "ecommerce",
  "marketplace",
  "portfolio",
  "marketing",
  "blog",
  "restaurant",
  "booking",
  "application",
  "unknown",
] as const;

export type BuildSiteKind =
  (typeof BUILD_SITE_KINDS)[number];

export type BuildComplexity =
  | "simple"
  | "standard"
  | "complex";

export type BuildCommerceMode =
  | "none"
  | "catalog"
  | "cart-checkout"
  | "marketplace";

export type BuildRoutingProvider =
  | "openai"
  | "gemini"
  | "claude"
  | "deepseek";

export type BuildRoutingMediaKind =
  | "image"
  | "audio"
  | "video";

export type BuildModelCandidate =
  Readonly<{
    provider: BuildRoutingProvider;
    model: string;
    tier:
      | "economy"
      | "balanced"
      | "strong";
    reason: string;
  }>;

export type BuildRequestProfile =
  Readonly<{
    siteKind: BuildSiteKind;
    industry: string | null;
    complexity: BuildComplexity;
    commerceMode: BuildCommerceMode;
    commerce: BuildCommerceSpecification | null;

    projectType: BuildProjectType;
    targets: readonly BuildTarget[];
    requirements: BuildRequirements;
    deploymentPreference:
      BuildDeploymentPreference;

    /**
     * Null means ZoeBuild correctly understands the request,
     * but no trusted registered stack supports it yet.
     *
     * Never substitute a visually similar but mechanically
     * incompatible stack.
     */
    stackId: string | null;
    supported: boolean;
    unsupportedReason: string | null;

    confidence:
      | "high"
      | "medium"
      | "low";

    /**
     * AI may personalize these responsibilities.
     */
    dynamicResponsibilities:
      readonly string[];

    /**
     * These remain deterministic/provider-managed.
     */
    staticResponsibilities:
      readonly string[];
  }>;

export type BuildModelRoute =
  Readonly<{
    strategy: "cost-aware";
    candidates:
      readonly BuildModelCandidate[];
  }>;

const EMPTY_REQUIREMENTS: BuildRequirements = {
  backend: false,
  database: false,
  auth: false,
  storage: false,
  payments: false,
  email: false,
  commerce: false,
};

const STATIC_RESPONSIBILITIES = [
  "project structure",
  "security boundaries",
  "runtime contracts",
  "dependency policy",
  "provider credentials",
  "secret handling",
] as const;

const DESIGN_RESPONSIBILITIES = [
  "visual direction",
  "layout composition",
  "page hierarchy",
  "section order",
  "brand expression",
  "typography direction",
  "content and copy",
] as const;

const COMMERCE_STATIC_RESPONSIBILITIES = [
  ...STATIC_RESPONSIBILITIES,
  "product data contracts",
  "cart mechanics",
  "checkout mechanics",
  "customer-account mechanics",
  "order mechanics",
  "payment mechanics",
  "inventory integration",
] as const;

const MARKETPLACE_TERMS = [
  "marketplace",
  "multi vendor",
  "multi-vendor",
  "multivendor",
  "multiple vendors",
  "multiple sellers",
  "vendor portal",
  "seller portal",
  "seller commission",
  "vendor commission",
  "etsy like",
  "etsy-like",
];

const COMMERCE_TERMS = [
  "ecommerce",
  "e-commerce",
  "online store",
  "online shop",
  "webshop",
  "boutique",
  "product catalog",
  "shopping cart",
  "add to cart",
  "checkout",
  "sell products",
  "sell clothes",
  "clothing store",
  "fashion store",
  "jewelry store",
  "shoe store",
  "merch store",
];

const PORTFOLIO_TERMS = [
  "portfolio",
  "photographer",
  "photography",
  "designer portfolio",
  "artist portfolio",
  "developer portfolio",
  "personal site",
  "resume site",
];

const BLOG_TERMS = [
  "blog",
  "news site",
  "articles",
  "publication",
  "magazine",
];

const RESTAURANT_TERMS = [
  "restaurant",
  "bakery",
  "cafe",
  "coffee shop",
  "food truck",
  "menu",
];

const BOOKING_TERMS = [
  "booking",
  "book appointments",
  "appointment",
  "reservations",
  "reservation system",
  "schedule appointments",
];

const APP_TERMS = [
  "dashboard",
  "web app",
  "saas",
  "admin portal",
  "customer portal",
  "member portal",
];

const MANAGED_FEATURE_TERMS = [
  "database",
  "user accounts",
  "login",
  "log in",
  "sign in",
  "authentication",
  "backend",
  "api",
  "upload files",
];

const COMPLEX_TERMS = [
  "custom checkout",
  "custom payment flow",
  "multi tenant",
  "multi-tenant",
  "realtime",
  "real-time",
  "erp",
  "warehouse sync",
  "inventory sync",
  "custom pricing",
  "commission",
  "complex workflow",
];

const FASHION_TERMS = [
  "clothes",
  "clothing",
  "fashion",
  "apparel",
  "boutique",
  "shoes",
  "jewelry",
];

function normalizePrompt(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(
  text: string,
  terms: readonly string[],
): boolean {
  return terms.some(
    (term) =>
      text.includes(term),
  );
}

function requirements(
  patch: Partial<BuildRequirements> = {},
): BuildRequirements {
  return {
    ...EMPTY_REQUIREMENTS,
    ...patch,
  };
}

function industryFor(
  prompt: string,
): string | null {
  if (
    includesAny(
      prompt,
      FASHION_TERMS,
    )
  ) {
    return "fashion";
  }

  if (
    includesAny(
      prompt,
      RESTAURANT_TERMS,
    )
  ) {
    return "food-hospitality";
  }

  if (
    prompt.includes("real estate") ||
    prompt.includes("realtor")
  ) {
    return "real-estate";
  }

  if (
    prompt.includes("fitness") ||
    prompt.includes("gym")
  ) {
    return "fitness";
  }

  return null;
}

function profile(
  input:
    Omit<
      BuildRequestProfile,
      "targets" | "commerce"
    > &
    Readonly<{
      commerce?:
        BuildCommerceSpecification |
        null;
    }>,
): BuildRequestProfile {
  return {
    ...input,
    commerce:
      input.commerce ??
      null,
    targets: ["web"],
  };
}

type CanonicalProfileInput =
  Omit<BuildRequestProfile,
    "projectType" | "targets" | "deploymentPreference" |
    "stackId" | "supported" | "unsupportedReason" | "commerce"> &
  Readonly<{
    commerce?: BuildCommerceSpecification | null;
    unsupportedReason?: string | null;
  }>;

/** Route every supported user intent to the single canonical TanStack stack.
 * Capability gates remain deterministic: do not promise databases, account
 * infrastructure, uploaded storage or email when no trusted adapter exists.
 */
function tanstackProfile(input: CanonicalProfileInput): BuildRequestProfile {
  const unsupportedReason = input.unsupportedReason ??
    (input.requirements.auth
      ? "Customer Account API and authentication require a verified provider boundary."
      : input.requirements.database
        ? "Database-backed workflows require a verified database integration."
        : input.requirements.storage
          ? "Uploaded storage requires a verified storage integration."
          : input.requirements.email
            ? "Transactional email requires a verified email integration."
            : null);
  return profile({
    ...input,
    projectType: "fullstack-app",
    deploymentPreference: "managed-runtime",
    stackId: unsupportedReason === null ? "tanstack-start-v1" : null,
    supported: unsupportedReason === null,
    unsupportedReason,
  });
}

export function classifyBuildRequest(promptValue: string): BuildRequestProfile {
  const prompt = normalizePrompt(promptValue);
  const industry = industryFor(prompt);

  if (includesAny(prompt, MARKETPLACE_TERMS)) {
    return tanstackProfile({
      siteKind: "marketplace", industry, complexity: "complex",
      commerceMode: "marketplace",
      commerce: { storefrontRuntime: "tanstack-start" },
      requirements: requirements({ backend: true, database: true, auth: true,
        storage: true, payments: true, email: true, commerce: true }),
      unsupportedReason: "Multi-vendor marketplace operations need verified seller isolation, commission accounting and provider integration.",
      confidence: "high",
      dynamicResponsibilities: [...DESIGN_RESPONSIBILITIES,
        "storefront merchandising", "seller-facing visual experience"],
      staticResponsibilities: COMMERCE_STATIC_RESPONSIBILITIES,
    });
  }

  const commerce = includesAny(prompt, COMMERCE_TERMS) ||
    (/\b(store|shop)\b/.test(prompt) &&
      /\b(product|products|sell|retail|clothes|fashion|jewelry|merch)\b/.test(prompt));
  if (commerce) {
    const complex = includesAny(prompt, COMPLEX_TERMS);
    const buyerAccounts =
      /\b(customer account|customer accounts|buyer account|buyer accounts|order history|saved addresses|customer login|customer sign in)\b/.test(prompt);
    return tanstackProfile({
      siteKind: "ecommerce", industry,
      complexity: complex ? "complex" : "standard",
      commerceMode: "cart-checkout",
      commerce: { storefrontRuntime: "tanstack-start" },
      requirements: requirements({ backend: true, auth: buyerAccounts,
        payments: true, commerce: true }),
      unsupportedReason: complex
        ? "Custom commerce behavior requires verified integrations beyond the standard storefront."
        : null,
      confidence: "high",
      dynamicResponsibilities: [...DESIGN_RESPONSIBILITIES,
        "storefront visual hierarchy", "product-card presentation",
        "collection presentation", "merchandising layout", "cart presentation"],
      staticResponsibilities: COMMERCE_STATIC_RESPONSIBILITIES,
    });
  }

  if (includesAny(prompt, BOOKING_TERMS)) {
    return tanstackProfile({
      siteKind: "booking", industry, complexity: "standard", commerceMode: "none",
      requirements: requirements({ backend: true, database: true }),
      confidence: "high",
      dynamicResponsibilities: DESIGN_RESPONSIBILITIES,
      staticResponsibilities: [...STATIC_RESPONSIBILITIES,
        "availability mechanics", "booking state"],
    });
  }

  if (includesAny(prompt, APP_TERMS) || includesAny(prompt, MANAGED_FEATURE_TERMS)) {
    return tanstackProfile({
      siteKind: "application", industry,
      complexity: includesAny(prompt, COMPLEX_TERMS) ? "complex" : "standard",
      commerceMode: "none",
      requirements: requirements({
        backend: true,
        database: prompt.includes("database"),
        auth: /\b(login|log in|sign in|authentication|user accounts)\b/.test(prompt),
        storage: /\b(upload files|file upload|upload images)\b/.test(prompt),
      }),
      confidence: "medium",
      dynamicResponsibilities: DESIGN_RESPONSIBILITIES,
      staticResponsibilities: STATIC_RESPONSIBILITIES,
    });
  }

  const portfolio = includesAny(prompt, PORTFOLIO_TERMS);
  const blog = includesAny(prompt, BLOG_TERMS);
  const restaurant = includesAny(prompt, RESTAURANT_TERMS);
  const marketing = /\b(landing page|business website|company website|marketing site|service website)\b/.test(prompt);
  const siteKind: BuildSiteKind = portfolio ? "portfolio" : blog ? "blog" :
    restaurant ? "restaurant" : marketing ? "marketing" : "unknown";
  return tanstackProfile({
    siteKind,
    industry: portfolio && prompt.includes("photograph") ? "photography" :
      restaurant ? "food-hospitality" : industry,
    complexity: "simple", commerceMode: "none",
    requirements: requirements({ backend: true }),
    confidence: siteKind === "unknown" ? "low" : "high",
    dynamicResponsibilities: DESIGN_RESPONSIBILITIES,
    staticResponsibilities: STATIC_RESPONSIBILITIES,
  });
}

export function resolveBuildModelRoute(
  profile:
    BuildRequestProfile,
  mediaKinds:
    readonly BuildRoutingMediaKind[] =
      [],
): BuildModelRoute {
  const hasAudioOrVideo =
    mediaKinds.some(
      (kind) =>
        kind === "audio" ||
        kind === "video",
    );

  if (hasAudioOrVideo) {
    return {
      strategy:
        "cost-aware",
      candidates: [
        {
          provider:
            "gemini",
          model:
            "gemini-3.1-flash-lite",
          tier:
            "economy",
          reason:
            "Cost-efficient native audio/video understanding.",
        },
        {
          provider:
            "gemini",
          model:
            "gemini-3.8-flash",
          tier:
            "balanced",
          reason:
            "Escalation for harder multimodal interpretation.",
        },
      ],
    };
  }

  if (
    profile.complexity ===
    "complex"
  ) {
    return {
      strategy:
        "cost-aware",
      candidates: [
        {
          provider:
            "openai",
          model:
            "gpt-6.1-sol",
          tier:
            "strong",
          reason:
            "Complex architecture or custom business behavior.",
        },
        {
          provider:
            "gemini",
          model:
            "gemini-3.8-flash",
          tier:
            "balanced",
          reason:
            "Cross-provider fallback for complex planning.",
        },
      ],
    };
  }

  return {
    strategy:
      "cost-aware",
    candidates: [
      {
        provider:
          "openai",
        model:
          "gpt-6-luna",
        tier:
          "economy",
        reason:
          "Lowest-cost capable default for focused text/image planning.",
      },
      {
        provider:
          "gemini",
        model:
          "gemini-3.1-flash-lite",
        tier:
          "economy",
        reason:
          "Low-cost cross-provider fallback.",
      },
      {
        provider:
          "openai",
        model:
          "gpt-6.1-sol",
        tier:
          "strong",
        reason:
          "Escalation after cheaper planning fails validation or availability.",
      },
    ],
  };
}
