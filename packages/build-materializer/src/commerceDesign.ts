import type {
  BuildDesignSpecification,
  ProjectSpecification,
} from "@zoeskoul/build-contracts";

import type {
  BuildTemplateDefinition,
} from "@zoeskoul/build-template-registry";

export const COMMERCE_STOREFRONT_DESIGN_PATHS = [
  "src/design/theme.css",
  "src/design/content.js",
  "src/design/layout.js",
] as const;

export type CommerceStorefrontDesignPath =
  (typeof COMMERCE_STOREFRONT_DESIGN_PATHS)[number];

function headingTracking(
  style:
    BuildDesignSpecification["style"],
): string {
  switch (style) {
    case "bold":
      return "-0.07em";

    case "editorial":
      return "-0.06em";

    case "luxury":
      return "-0.045em";

    case "playful":
      return "-0.035em";

    case "technical":
      return "-0.04em";

    case "minimal":
    default:
      return "-0.05em";
  }
}

function radius(
  treatment:
    BuildDesignSpecification["layout"]["cardTreatment"],
): string {
  switch (treatment) {
    case "sharp":
      return "4px";

    case "minimal":
      return "12px";

    case "soft":
    default:
      return "24px";
  }
}

function gridGap(
  density:
    BuildDesignSpecification["layout"]["productDensity"],
): string {
  switch (density) {
    case "compact":
      return "14px";

    case "airy":
      return "34px";

    case "comfortable":
    default:
      return "24px";
  }
}

function js(
  value: unknown,
): string {
  return JSON.stringify(
    value,
    null,
    2,
  );
}

/**
 * Deterministic renderer for model-approved design tokens.
 *
 * The model does not write source files. It supplies validated values and this
 * renderer owns the source-code shape.
 */
export function renderCommerceStorefrontDesignFiles(
  design:
    BuildDesignSpecification,
): Readonly<
  Record<
    CommerceStorefrontDesignPath,
    string
  >
> {
  const {
    palette,
    layout,
    content,
  } = design;

  const theme = `:root {
  --surface: ${palette.surface};
  --surface-soft: ${palette.surfaceSoft};
  --text: ${palette.text};
  --muted: ${palette.muted};
  --border: ${palette.border};

  --accent: ${palette.accent};
  --accent-contrast: ${palette.accentContrast};

  --art-start: ${palette.artStart};
  --art-end: ${palette.artEnd};

  --radius-card: ${radius(layout.cardTreatment)};
  --radius-button: 999px;
  --grid-gap: ${gridGap(layout.productDensity)};
  --heading-tracking: ${headingTracking(design.style)};
}

.hero h1,
.section-heading h2,
.story-section h2 {
  letter-spacing: var(--heading-tracking);
}

body[data-hero-alignment="centered"] .hero {
  grid-template-columns: 1fr;
  text-align: center;
}

body[data-hero-alignment="centered"] .hero-copy {
  margin-inline: auto;
}

body[data-hero-alignment="centered"] .hero-body {
  margin-inline: auto;
}

body[data-hero-alignment="editorial"] .hero {
  grid-template-columns: minmax(0, 1.25fr) minmax(240px, 0.55fr);
}

body[data-product-density="compact"] .product-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

body[data-product-density="airy"] .product-grid {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

body[data-card-treatment="minimal"] .product-media {
  box-shadow: none;
}

body[data-card-treatment="sharp"] .product-media {
  border-radius: 4px;
}
`;

  const contentSource =
    `/* Generated deterministically from validated ZoeBuild design data. */\n` +
    `export const storefrontContent = ${js(content)};\n`;

  const layoutSource =
    `/* Generated deterministically from validated ZoeBuild design data. */\n` +
    `export const storefrontLayout = ${js({
      heroAlignment:
        layout.hero,

      productDensity:
        layout.productDensity,

      cardTreatment:
        layout.cardTreatment,
    })};\n`;

  return {
    "src/design/theme.css":
      theme,

    "src/design/content.js":
      contentSource,

    "src/design/layout.js":
      layoutSource,
  };
}

export function applyBuildDesignToTemplate(
  specification:
    ProjectSpecification,

  template:
    BuildTemplateDefinition,
): BuildTemplateDefinition {
  if (
    specification.stackId !==
      "commerce-storefront-v1" ||
    !specification.design
  ) {
    return template;
  }

  const rendered =
    renderCommerceStorefrontDesignFiles(
      specification.design,
    );

  let replaced = 0;

  const files =
    template.files.map(
      (file) => {
        const content =
          rendered[
            file.path as
              CommerceStorefrontDesignPath
          ];

        if (
          typeof content !==
          "string"
        ) {
          return file;
        }

        replaced += 1;

        return {
          ...file,
          content,
        };
      },
    );

  if (
    replaced !==
    COMMERCE_STOREFRONT_DESIGN_PATHS.length
  ) {
    throw new Error(
      "Commerce storefront template is missing one or more registered design surfaces.",
    );
  }

  return {
    ...template,
    files,
  };
}
