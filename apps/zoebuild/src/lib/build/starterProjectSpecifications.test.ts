import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseProjectSpecification,
} from "@zoeskoul/build-application";

import {
  createStarterProjectSpecification,
  ZOEBUILD_STARTER_KINDS,
} from "./starterProjectSpecifications";

describe(
  "ZoeBuild starter project specifications",
  () => {
    it(
      "imports and validates every starter",
      () => {
        expect(
          ZOEBUILD_STARTER_KINDS,
        ).toEqual([
          "website",
          "web-app",
          "storefront",
        ]);

        for (
          const kind
          of ZOEBUILD_STARTER_KINDS
        ) {
          const specification =
            parseProjectSpecification(
              createStarterProjectSpecification(
                kind,
                `${kind} test`,
              ),
            );

          expect(
            specification.name,
          ).toBe(
            `${kind} test`,
          );

          expect(
            specification.targets,
          ).toEqual([
            "web",
          ]);

          expect(
            specification.pages,
          ).toEqual([
            "Home",
          ]);
        }
      },
    );

    it(
      "enables commerce only on storefront",
      () => {
        const website =
          parseProjectSpecification(
            createStarterProjectSpecification(
              "website",
              "Website",
            ),
          );

        const webApp =
          parseProjectSpecification(
            createStarterProjectSpecification(
              "web-app",
              "Web App",
            ),
          );

        const storefront =
          parseProjectSpecification(
            createStarterProjectSpecification(
              "storefront",
              "Storefront",
            ),
          );

        expect(
          website.requirements.payments,
        ).toBe(false);

        expect(
          website.requirements.commerce,
        ).toBe(false);

        expect(
          webApp.requirements.payments,
        ).toBe(false);

        expect(
          webApp.requirements.commerce,
        ).toBe(false);

        expect(
          storefront.requirements.payments,
        ).toBe(true);

        expect(
          storefront.requirements.commerce,
        ).toBe(true);


        expect(
          storefront.commerce,
        ).toEqual({
          storefrontRuntime:
            "react-vite",
        });
      },
    );

    it(
      "returns independent request objects",
      () => {
        const first =
          createStarterProjectSpecification(
            "website",
            "First",
          );

        const second =
          createStarterProjectSpecification(
            "website",
            "Second",
          );

        expect(first).not.toBe(
          second,
        );

        expect(first.name).toBe(
          "First",
        );

        expect(second.name).toBe(
          "Second",
        );
      },
    );
  },
);
