import type {
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
  input: Omit<
    BuildRequestProfile,
    "targets"
  >,
): BuildRequestProfile {
  return {
    ...input,
    targets: ["web"],
  };
}

export function classifyBuildRequest(
  promptValue: string,
): BuildRequestProfile {
  const prompt =
    normalizePrompt(promptValue);

  const marketplace =
    includesAny(
      prompt,
      MARKETPLACE_TERMS,
    );

  if (marketplace) {
    return profile({
      siteKind: "marketplace",
      industry:
        industryFor(prompt),
      complexity: "complex",
      commerceMode:
        "marketplace",
      projectType:
        "fullstack-app",
      requirements:
        requirements({
          backend: true,
          database: true,
          auth: true,
          storage: true,
          payments: true,
          email: true,
          commerce: true,
        }),
      deploymentPreference:
        "managed-runtime",
      stackId: null,
      supported: false,
      unsupportedReason:
        "Marketplace and multi-vendor commerce require a trusted full-stack commerce foundation that is not registered yet.",
      confidence: "high",
      dynamicResponsibilities: [
        ...DESIGN_RESPONSIBILITIES,
        "storefront merchandising",
        "seller-facing visual experience",
      ],
      staticResponsibilities:
        COMMERCE_STATIC_RESPONSIBILITIES,
    });
  }

  const commerce =
    includesAny(
      prompt,
      COMMERCE_TERMS,
    ) ||
    (
      /\b(store|shop)\b/.test(
        prompt,
      ) &&
      /\b(product|products|sell|retail|clothes|fashion|jewelry|merch)\b/.test(
        prompt,
      )
    );

  if (commerce) {
    const complex =
      includesAny(
        prompt,
        COMPLEX_TERMS,
      );

    const buyerAccounts =
      /\b(customer account|customer accounts|buyer account|buyer accounts|order history|saved addresses|customer login|customer sign in)\b/.test(
        prompt,
      );

    if (
      complex ||
      buyerAccounts
    ) {
      return profile({
        siteKind:
          "ecommerce",

        industry:
          industryFor(
            prompt,
          ),

        complexity:
          complex
            ? "complex"
            : "standard",

        commerceMode:
          "cart-checkout",

        projectType:
          "frontend-app",

        requirements:
          requirements({
            auth:
              buyerAccounts,
            payments: true,
            commerce: true,
          }),

        deploymentPreference:
          "managed-runtime",

        stackId: null,
        supported: false,

        unsupportedReason:
          complex
            ? "This ecommerce request requires custom commerce behavior beyond the trusted standard storefront foundation."
            : "Customer-account ecommerce requires the dedicated Customer Account API boundary before ZoeBuild can generate it safely.",

        confidence:
          "high",

        dynamicResponsibilities: [
          ...DESIGN_RESPONSIBILITIES,
          "storefront visual hierarchy",
          "product-card presentation",
          "collection presentation",
          "merchandising layout",
          "cart presentation",
        ],

        staticResponsibilities:
          COMMERCE_STATIC_RESPONSIBILITIES,
      });
    }

    return profile({
      siteKind:
        "ecommerce",

      industry:
        industryFor(
          prompt,
        ),

      complexity:
        "standard",

      commerceMode:
        "cart-checkout",

      projectType:
        "frontend-app",

      requirements:
        requirements({
          payments: true,
          commerce: true,
        }),

      // The ZoeBuild asset is static. The commerce provider
      // owns transactional state and hosted checkout.
      deploymentPreference:
        "static",

      stackId:
        "commerce-storefront-v1",

      supported: true,
      unsupportedReason:
        null,

      confidence:
        "high",

      dynamicResponsibilities: [
        ...DESIGN_RESPONSIBILITIES,
        "storefront visual hierarchy",
        "product-card presentation",
        "collection presentation",
        "merchandising layout",
        "cart presentation",
      ],

      staticResponsibilities:
        COMMERCE_STATIC_RESPONSIBILITIES,
    });
  }

  const booking =
    includesAny(
      prompt,
      BOOKING_TERMS,
    );

  if (booking) {
    return profile({
      siteKind: "booking",
      industry:
        industryFor(prompt),
      complexity: "standard",
      commerceMode: "none",
      projectType:
        "fullstack-app",
      requirements:
        requirements({
          backend: true,
          database: true,
        }),
      deploymentPreference:
        "managed-runtime",
      stackId: null,
      supported: false,
      unsupportedReason:
        "Transactional booking requires a trusted managed backend stack that is not registered yet.",
      confidence: "high",
      dynamicResponsibilities:
        DESIGN_RESPONSIBILITIES,
      staticResponsibilities: [
        ...STATIC_RESPONSIBILITIES,
        "availability mechanics",
        "booking state",
      ],
    });
  }

  const managedApplication =
    includesAny(
      prompt,
      APP_TERMS,
    ) ||
    includesAny(
      prompt,
      MANAGED_FEATURE_TERMS,
    );

  if (managedApplication) {
    const managed =
      includesAny(
        prompt,
        MANAGED_FEATURE_TERMS,
      );

    if (managed) {
      return profile({
        siteKind:
          "application",
        industry:
          industryFor(prompt),
        complexity:
          includesAny(
            prompt,
            COMPLEX_TERMS,
          )
            ? "complex"
            : "standard",
        commerceMode: "none",
        projectType:
          "fullstack-app",
        requirements:
          requirements({
            backend: true,
            database:
              prompt.includes(
                "database",
              ),
            auth:
              /\b(login|log in|sign in|authentication|user accounts)\b/.test(
                prompt,
              ),
            storage:
              prompt.includes(
                "upload",
              ),
          }),
        deploymentPreference:
          "managed-runtime",
        stackId: null,
        supported: false,
        unsupportedReason:
          "This request requires managed application capabilities for which ZoeBuild does not yet have a compatible registered stack.",
        confidence: "high",
        dynamicResponsibilities:
          DESIGN_RESPONSIBILITIES,
        staticResponsibilities:
          STATIC_RESPONSIBILITIES,
      });
    }

    return profile({
      siteKind: "application",
      industry:
        industryFor(prompt),
      complexity: "standard",
      commerceMode: "none",
      projectType:
        "frontend-app",
      requirements:
        requirements(),
      deploymentPreference:
        "static",
      stackId:
        "react-vite-v1",
      supported: true,
      unsupportedReason: null,
      confidence: "medium",
      dynamicResponsibilities:
        DESIGN_RESPONSIBILITIES,
      staticResponsibilities:
        STATIC_RESPONSIBILITIES,
    });
  }

  if (
    includesAny(
      prompt,
      PORTFOLIO_TERMS,
    )
  ) {
    return profile({
      siteKind: "portfolio",
      industry:
        prompt.includes(
          "photograph",
        )
          ? "photography"
          : industryFor(
              prompt,
            ),
      complexity: "simple",
      commerceMode: "none",
      projectType:
        "static-site",
      requirements:
        requirements(),
      deploymentPreference:
        "static",
      stackId:
        "static-html-v1",
      supported: true,
      unsupportedReason: null,
      confidence: "high",
      dynamicResponsibilities:
        DESIGN_RESPONSIBILITIES,
      staticResponsibilities:
        STATIC_RESPONSIBILITIES,
    });
  }

  if (
    includesAny(
      prompt,
      BLOG_TERMS,
    )
  ) {
    return profile({
      siteKind: "blog",
      industry:
        industryFor(prompt),
      complexity: "simple",
      commerceMode: "none",
      projectType:
        "static-site",
      requirements:
        requirements(),
      deploymentPreference:
        "static",
      stackId:
        "static-html-v1",
      supported: true,
      unsupportedReason: null,
      confidence: "high",
      dynamicResponsibilities:
        DESIGN_RESPONSIBILITIES,
      staticResponsibilities:
        STATIC_RESPONSIBILITIES,
    });
  }

  if (
    includesAny(
      prompt,
      RESTAURANT_TERMS,
    )
  ) {
    return profile({
      siteKind:
        "restaurant",
      industry:
        "food-hospitality",
      complexity: "simple",
      commerceMode: "none",
      projectType:
        "static-site",
      requirements:
        requirements(),
      deploymentPreference:
        "static",
      stackId:
        "static-html-v1",
      supported: true,
      unsupportedReason: null,
      confidence: "high",
      dynamicResponsibilities:
        DESIGN_RESPONSIBILITIES,
      staticResponsibilities:
        STATIC_RESPONSIBILITIES,
    });
  }

  const marketing =
    /\b(landing page|business website|company website|marketing site|service website)\b/.test(
      prompt,
    );

  return profile({
    siteKind:
      marketing
        ? "marketing"
        : "unknown",
    industry:
      industryFor(prompt),
    complexity: "simple",
    commerceMode: "none",
    projectType:
      "static-site",
    requirements:
      requirements(),
    deploymentPreference:
      "static",
    stackId:
      "static-html-v1",
    supported: true,
    unsupportedReason: null,
    confidence:
      marketing
        ? "high"
        : "low",
    dynamicResponsibilities:
      DESIGN_RESPONSIBILITIES,
    staticResponsibilities:
      STATIC_RESPONSIBILITIES,
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
