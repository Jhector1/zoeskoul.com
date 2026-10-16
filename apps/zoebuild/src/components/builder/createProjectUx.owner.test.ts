import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const client =
  readFileSync(
    new URL(
      "./CreateBuildProjectClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const page =
  readFileSync(
    new URL(
      "../../app/[locale]/projects/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const route =
  readFileSync(
    new URL(
      "../../app/api/build/projects/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "ZoeBuild create-project UX",
  () => {
    it(
      "uses the canonical creation API",
      () => {
        expect(client).toContain(
          '"/api/build/projects"',
        );

        expect(client).toContain(
          '"POST"',
        );

        expect(client).toContain(
          '"same-origin"',
        );

        expect(client).toContain(
          "specification,",
        );
      },
    );

    it(
      "opens the created project",
      () => {
        expect(client).toContain(
          "buildProjectId",
        );

        expect(client).toContain(
          "router.push(",
        );
      },
    );

    it(
      "keeps archetypes above technical stack selection",
      () => {
        expect(client).toContain(
          '"website"',
        );

        expect(client).toContain(
          '"web-app"',
        );

        expect(client).toContain(
          '"storefront"',
        );

        expect(client).toContain(
          "Business, landing page, portfolio, blog, or content site.",
        );
      },
    );

    it(
      "replaces the old placeholder",
      () => {
        expect(page).toContain(
          "<CreateBuildProjectClient locale={locale} />",
        );

        expect(page).toContain(
          "Create your first project",
        );

        expect(page).not.toContain(
          "creation experience comes in a later UI wave",
        );
      },
    );

    it(
      "keeps security on the server boundary",
      () => {
        expect(route).toContain(
          "enforceSameOriginPost(req)",
        );

        expect(route).toContain(
          'bucket: "zoebuild-project-create"',
        );

        expect(route).toContain(
          "parseProjectSpecification(body.specification)",
        );

        expect(route).toContain(
          "createBuildProjectCommand({",
        );
      },
    );
  },
);
