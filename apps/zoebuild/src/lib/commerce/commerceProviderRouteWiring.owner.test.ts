import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";

import {
  describe,
  expect,
  it,
} from "vitest";

const repo = resolve(
  fileURLToPath(
    new URL(
      "../../../../../",
      import.meta.url,
    ),
  ),
);

function read(relative: string) {
  return readFileSync(
    resolve(repo, relative),
    "utf8",
  );
}

function nativeCapabilityCalls(
  source: string,
) {
  const positions: number[] = [];
  const needle =
    "await requireNativeCommerceCapability({";

  let cursor = 0;

  while (true) {
    const found =
      source.indexOf(
        needle,
        cursor,
      );

    if (found < 0) break;

    positions.push(found);
    cursor =
      found +
      needle.length;
  }

  return positions;
}

describe(
  "ZoeBuild commerce provider route wiring",
  () => {
    const preview =
      read(
        "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts",
      );

    const published =
      read(
        "apps/zoebuild/src/app/sites/[buildProjectId]/[[...path]]/route.ts",
      );

    it(
      "requires provider resolution before preview native catalog and cart execution",
      () => {
        const calls =
          nativeCapabilityCalls(
            preview,
          );

        expect(calls).toHaveLength(2);

        const catalogCall =
          calls[0] ?? -1;
        const cartCall =
          calls[1] ?? -1;

        const getProduct =
          preview.indexOf(
            "getNativeCommerceProduct(",
            catalogCall,
          );
        const listProducts =
          preview.indexOf(
            "listNativeCommerceProducts(",
            catalogCall,
          );

        expect(getProduct).toBeGreaterThan(
          catalogCall,
        );
        expect(listProducts).toBeGreaterThan(
          catalogCall,
        );

        const catalogGuardBlock =
          preview.slice(
            catalogCall,
            Math.min(
              getProduct,
              listProducts,
            ),
          );

        expect(
          catalogGuardBlock,
        ).toMatch(
          /capability:\s*"catalog"/,
        );

        const executeCart =
          preview.indexOf(
            "executeNativeCommerceCartCommand(",
            cartCall,
          );

        expect(executeCart).toBeGreaterThan(
          cartCall,
        );

        const cartGuardBlock =
          preview.slice(
            cartCall,
            executeCart,
          );

        expect(
          cartGuardBlock,
        ).toMatch(
          /capability:\s*"cart"/,
        );
      },
    );

    it(
      "preserves preview capability authorization and cart limiting before provider resolution",
      () => {
        const calls =
          nativeCapabilityCalls(
            preview,
          );

        const catalogCall =
          calls[0] ?? -1;
        const cartCall =
          calls[1] ?? -1;

        const trustedCapability =
          preview.indexOf(
            "resolveTrustedReactPreviewCapabilityAtRunner({",
          );

        const cartRateLimit =
          preview.indexOf(
            "const cartRateLimit =",
          );

        expect(
          trustedCapability,
        ).toBeGreaterThanOrEqual(
          0,
        );

        expect(
          trustedCapability,
        ).toBeLessThan(
          catalogCall,
        );

        expect(
          cartRateLimit,
        ).toBeGreaterThanOrEqual(
          0,
        );

        expect(
          cartRateLimit,
        ).toBeLessThan(
          cartCall,
        );
      },
    );

    it(
      "requires provider resolution after published deployment gating and before native execution",
      () => {
        const calls =
          nativeCapabilityCalls(
            published,
          );

        expect(calls).toHaveLength(2);

        const cartCall =
          calls[0] ?? -1;
        const catalogCall =
          calls[1] ?? -1;

        const deploymentGuard =
          published.indexOf(
            "const deployment =",
          );

        const cartRateLimit =
          published.indexOf(
            "const cartRateLimit =",
          );

        expect(
          deploymentGuard,
        ).toBeGreaterThanOrEqual(
          0,
        );

        expect(
          deploymentGuard,
        ).toBeLessThan(
          cartCall,
        );

        expect(
          cartRateLimit,
        ).toBeGreaterThanOrEqual(
          0,
        );

        expect(
          cartRateLimit,
        ).toBeLessThan(
          cartCall,
        );

        expect(
          published.indexOf(
            'capability:\n        "cart"',
            cartCall,
          ),
        ).toBeGreaterThan(
          cartCall,
        );

        expect(
          published.indexOf(
            "executeNativeCommerceCartCommand(",
            cartCall,
          ),
        ).toBeGreaterThan(
          cartCall,
        );

        expect(
          published.indexOf(
            'capability:\n          "catalog"',
            catalogCall,
          ),
        ).toBeGreaterThan(
          catalogCall,
        );

        expect(
          published.indexOf(
            "getNativeCommerceProduct(",
            catalogCall,
          ),
        ).toBeGreaterThan(
          catalogCall,
        );

        expect(
          published.indexOf(
            "listNativeCommerceProducts(",
            catalogCall,
          ),
        ).toBeGreaterThan(
          catalogCall,
        );
      },
    );

    it(
      "fails provider-resolution errors closed without exposing provider configuration",
      () => {
        for (
          const source of [
            preview,
            published,
          ]
        ) {
          expect(source).toContain(
            "CommerceProviderResolutionError",
          );

          expect(source).toContain(
            '"Commerce service unavailable."',
          );

          expect(source).not.toContain(
            "credentialsSecretRef",
          );

          expect(source).not.toContain(
            "webhookSecretRef",
          );
        }
      },
    );
  },
);
