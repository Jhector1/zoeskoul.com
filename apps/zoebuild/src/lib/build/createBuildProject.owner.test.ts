import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const repo =
  resolve(
    __dirname,
    "../../../../..",
  );

const source =
  readFileSync(
    resolve(
      repo,
      "apps/zoebuild/src/lib/build/createBuildProject.ts",
    ),
    "utf8",
  );

describe(
  "ZoeBuild persistence ownership",
  () => {
    it(
      "keeps source Build metadata and optional commerce bootstrap in one Prisma transaction",
      () => {
        expect(
          source,
        ).toContain(
          "client.$transaction",
        );
        expect(
          source,
        ).toContain(
          "saveCodeProjectInTransaction",
        );
        expect(
          source,
        ).toContain(
          "tx.buildProject.create",
        );
        expect(
          source,
        ).toContain(
          "tx.commerceStore.create",
        );
      },
    );

    it(
      "provisions explicit ZoeStore test and live internal connections",
      () => {
        expect(
          source,
        ).toContain(
          "COMMERCE_PROVIDER_ENVIRONMENTS",
        );
        expect(
          source,
        ).toContain(
          "commerceProviderConnection",
        );
        expect(
          source,
        ).toContain(
          "ZOESTORE_COMMERCE_PROVIDER",
        );
        expect(
          source,
        ).toContain(
          "zoeStoreCommerceProviderRoutes",
        );
        expect(
          source,
        ).toContain(
          '"active"',
        );
        expect(
          source,
        ).toContain(
          '"internal"',
        );
      },
    );

    it(
      "does not silently create an external payment connection during store bootstrap",
      () => {
        expect(
          source,
        ).not.toMatch(
          /provider:\s*"stripe"/,
        );
      },
    );
  },
);
