import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BUILD_DESIGN_JSON_SCHEMA,
  BuildDesignSpecificationError,
  PROJECT_SPECIFICATION_JSON_SCHEMA,
  parseBuildDesignSpecification,
  parseProjectSpecification,
} from "./index";

const design = {
  version: 1,

  style:
    "luxury",

  palette: {
    surface:
      "#FAF7F2",

    surfaceSoft:
      "#EFE8DE",

    text:
      "#171411",

    muted:
      "#746C63",

    border:
      "#DDD3C7",

    accent:
      "#55392A",

    accentContrast:
      "#FFFFFF",

    artStart:
      "#DCC6B5",

    artEnd:
      "#7D5947",
  },

  layout: {
    hero:
      "editorial",

    productDensity:
      "airy",

    cardTreatment:
      "minimal",
  },

  content: {
    brandName:
      "Maison Zoe",

    eyebrow:
      "Autumn collection",

    heroTitle:
      "Quiet luxury for everyday life.",

    heroBody:
      "A refined collection of pieces chosen for texture, proportion, and lasting character.",

    heroCta:
      "Shop collection",

    featuredHeading:
      "Selected pieces",

    storyHeading:
      "Made to stay with you.",

    storyBody:
      "Thoughtful objects and garments with an emphasis on quality, restraint, and useful beauty.",
  },
} as const;

function project(
  inputDesign: unknown,
) {
  return {
    version: 1,

    name:
      "Maison Zoe",

    projectType:
      "frontend-app",

    targets: [
      "web",
    ],

    requirements: {
      backend: false,
      database: false,
      auth: false,
      storage: false,
      payments: true,
      email: false,
      commerce: true,
    },

    pages: [
      "Home",
      "Shop",
      "Cart",
    ],

    stackId:
      "commerce-static-v1",

    commerce: {
      provider:
        "zoebuild-native",
      storefrontRuntime:
        "static",
    },

    design:
      inputDesign,

    deployment: {
      preference:
        "static",
    },
  };
}

describe(
  "ZoeBuild design specification",
  () => {
    it(
      "accepts bounded presentation-only design data",
      () => {
        expect(
          parseBuildDesignSpecification(
            design,
          ),
        ).toEqual(
          design,
        );

        expect(
          parseProjectSpecification(
            project(
              design,
            ),
          ).design,
        ).toEqual(
          design,
        );
      },
    );

    it(
      "rejects arbitrary CSS or executable values in color surfaces",
      () => {
        expect(
          () =>
            parseBuildDesignSpecification({
              ...design,

              palette: {
                ...design.palette,

                accent:
                  "url(javascript:alert(1))",
              },
            }),
        ).toThrow(
          BuildDesignSpecificationError,
        );
      },
    );

    it(
      "keeps design optional for existing trusted callers",
      () => {
        const value =
          project(
            design,
          ) as Record<
            string,
            unknown
          >;

        delete value.design;

        const parsed =
          parseProjectSpecification(
            value,
          );

        expect(
          Object.prototype
            .hasOwnProperty.call(
              parsed,
              "design",
            ),
        ).toBe(false);
      },
    );

    it(
      "makes the canonical JSON schema aware of nullable design",
      () => {
        expect(
          PROJECT_SPECIFICATION_JSON_SCHEMA
            .properties
            .design,
        ).toEqual({
          anyOf: [
            BUILD_DESIGN_JSON_SCHEMA,
            {
              type:
                "null",
            },
          ],
        });

        expect(
          PROJECT_SPECIFICATION_JSON_SCHEMA
            .required,
        ).not.toContain(
          "design",
        );
      },
    );
  },
);
