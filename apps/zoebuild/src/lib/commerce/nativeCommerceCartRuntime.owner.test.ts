import {
  readFileSync,
} from "node:fs";
import {
  fileURLToPath,
} from "node:url";
import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  relative:
    string,
) {
  return readFileSync(
    fileURLToPath(
      new URL(
        relative,
        import.meta.url,
      ),
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild Native Commerce cart runtime",
  () => {
    it(
      "keeps raw CommerceCart primary keys server-only and hashes a 256-bit browser token",
      () => {
        const nativeSource =
          readFileSync(
            new URL(
              "./nativeCommerceCart.ts",
              import.meta.url,
            ),
            "utf8",
          );

        const tokenSource =
          readFileSync(
            new URL(
              "./commerceCartToken.ts",
              import.meta.url,
            ),
            "utf8",
          );

        expect(
          tokenSource,
        ).toContain(
          "export const COMMERCE_CART_TOKEN_BYTES =",
        );

        expect(
          tokenSource,
        ).toContain(
          "  32;",
        );

        expect(
          tokenSource,
        ).toContain(
          "randomBytes(",
        );

        expect(
          tokenSource,
        ).toContain(
          'createHash(\n    "sha256",',
        );

        expect(
          nativeSource,
        ).toContain(
          "createCommerceCartPublicToken",
        );

        expect(
          nativeSource,
        ).toContain(
          "hashCommerceCartPublicToken",
        );

        expect(
          nativeSource,
        ).toContain(
          "isCommerceCartPublicToken",
        );

        expect(
          nativeSource,
        ).toContain(
          "// browser token, never the CommerceCart primary key.",
        );

        expect(
          nativeSource,
        ).toContain(
          "id:\n      cartToken",
        );

        expect(
          nativeSource,
        ).not.toContain(
          "randomBytes(",
        );

        expect(
          nativeSource,
        ).not.toContain(
          "createHash(",
        );
      },
    );

    it(
      "derives the store from BuildProject and never accepts browser store authority",
      () => {
        const cart =
          source(
            "./nativeCommerceCart.ts",
          );

        const resolveStoreStart =
          cart.indexOf(
            "async function resolveStore(",
          );

        const loadCartStart =
          cart.indexOf(
            "async function loadCart(",
            resolveStoreStart,
          );

        const resolveStoreSource =
          cart.slice(
            resolveStoreStart,
            loadCartStart,
          );

        const parserStart =
          cart.indexOf(
            "export function parseNativeCommerceCartCommand(",
          );

        const parserEnd =
          cart.indexOf(
            "export async function executeCommerceCartCommand(",
            parserStart,
          );

        const parserSource =
          cart.slice(
            parserStart,
            parserEnd,
          );

        expect(
          resolveStoreSource,
        ).toContain(
          ".commerceStore",
        );

        expect(
          resolveStoreSource,
        ).toContain(
          "input.buildProjectId",
        );

        expect(
          parserSource,
        ).not.toContain(
          "storeId",
        );
      },
    );

    it(
      "rejects zero negative oversized and unavailable quantities",
      () => {
        const cart =
          source(
            "./nativeCommerceCart.ts",
          );

        expect(
          cart,
        ).toContain(
          "MAX_LINE_QUANTITY",
        );

        expect(
          cart,
        ).toContain(
          "Number(value) < 1",
        );

        expect(
          cart,
        ).toContain(
          "reservedQuantity",
        );

        expect(
          cart,
        ).toContain(
          "COMMERCE_INVENTORY_UNAVAILABLE",
        );
      },
    );

    it(
      "does not reserve or decrement inventory merely for cart membership",
      () => {
        const cart =
          source(
            "./nativeCommerceCart.ts",
          );

        expect(
          cart,
        ).not.toContain(
          "reservedQuantity: {",
        );

        expect(
          cart,
        ).not.toContain(
          "decrement:",
        );
      },
    );

    it(
      "keeps preview cart mutation behind the existing runner capability context",
      () => {
        const route =
          source(
            "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts",
          );

        const cartPath =
          route.indexOf(
            '"__zoebuild/commerce/cart"',
          );

        const postStart =
          route.indexOf(
            "export async function POST(",
          );

        const capabilityContext =
          route.indexOf(
            "resolveTrustedReactPreviewCapabilityAtRunner",
            postStart,
          );

        const projectComparison =
          route.indexOf(
            "context.buildProjectId !==",
            capabilityContext,
          );

        const cartExecution =
          route.indexOf(
            "executeCommerceCartCommand",
            projectComparison,
          );

        expect(
          cartPath,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          postStart,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          capabilityContext,
        ).toBeGreaterThan(
          postStart,
        );

        expect(
          projectComparison,
        ).toBeGreaterThan(
          capabilityContext,
        );

        expect(
          cartExecution,
        ).toBeGreaterThan(
          projectComparison,
        );
      },
    );

    it(
      "requires the existing ready published deployment before published cart mutation",
      () => {
        const route =
          source(
            "../../app/sites/[buildProjectId]/[[...path]]/route.ts",
          );

        const postStart =
          route.indexOf(
            "export async function POST(",
          );

        const publishedOrigin =
          route.indexOf(
            "isPublishedSiteOriginRequest",
            postStart,
          );

        const deploymentLookup =
          route.indexOf(
            ".buildDeployment",
            postStart,
          );

        const ready =
          route.indexOf(
            '"ready"',
            deploymentLookup,
          );

        const cartExecution =
          route.indexOf(
            "executeCommerceCartCommand",
            ready,
          );

        expect(
          postStart,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          publishedOrigin,
        ).toBeGreaterThan(
          postStart,
        );

        expect(
          deploymentLookup,
        ).toBeGreaterThan(
          publishedOrigin,
        );

        expect(
          ready,
        ).toBeGreaterThan(
          deploymentLookup,
        );

        expect(
          cartExecution,
        ).toBeGreaterThan(
          ready,
        );
      },
    );

    it(
      "keeps checkout and payment behavior out of V1B",
      () => {
        const cart =
          source(
            "./nativeCommerceCart.ts",
          );

        expect(
          cart.toLowerCase(),
        ).not.toContain(
          "checkout",
        );

        expect(
          cart,
        ).not.toContain(
          "paymentProvider",
        );
      },
    );
    it(
      "supports opaque-origin JSON POST preflight without weakening capability authorization",
      () => {
        const route =
          source(
            "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts",
          );

        const options =
          route.indexOf(
            "export async function OPTIONS(",
          );

        const cartPath =
          route.indexOf(
            '"__zoebuild/commerce/cart"',
            options,
          );

        const allowOrigin =
          route.indexOf(
            '"Access-Control-Allow-Origin"',
            options,
          );

        const allowMethods =
          route.indexOf(
            '"Access-Control-Allow-Methods"',
            options,
          );

        const allowHeaders =
          route.indexOf(
            '"Access-Control-Allow-Headers"',
            options,
          );

        const post =
          route.indexOf(
            "export async function POST(",
          );

        const capabilityResolution =
          route.indexOf(
            "resolveTrustedReactPreviewCapabilityAtRunner",
            post,
          );

        expect(
          options,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          cartPath,
        ).toBeGreaterThan(
          options,
        );

        expect(
          allowOrigin,
        ).toBeGreaterThan(
          options,
        );

        expect(
          allowMethods,
        ).toBeGreaterThan(
          options,
        );

        expect(
          allowHeaders,
        ).toBeGreaterThan(
          options,
        );

        expect(
          capabilityResolution,
        ).toBeGreaterThan(
          post,
        );

        expect(
          route,
        ).not.toContain(
          "allow-same-origin",
        );
      },
    );

  },
);
