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

// Resolve from this test file, not Vitest's working directory.
// Vitest config already sets the working root to the monorepo root.
const repo = resolve(__dirname, "../../../../..");

function source(
  relative:
    string,
) {
  return readFileSync(
    resolve(
      repo,
      relative,
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild host-owned static commerce preview bridge",
  () => {
    const route =
      source(
        "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/preview/route.ts",
      );

    const shell =
      source(
        "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
      );

    const preview =
      source(
        "packages/learner-workspace/src/runner/components/WebPreview.tsx",
      );

    const bridge =
      source(
        "packages/learner-workspace/src/runner/components/webPreviewCommerceBridge.ts",
      );

    it(
      "keeps iframe commerce behind active-frame RPC and authenticated same-origin host authority",
      () => {
        expect(
          bridge,
        ).toContain(
          "eventSource !==",
        );

        expect(
          bridge,
        ).toContain(
          "activeIframeWindow",
        );

        expect(
          preview,
        ).toContain(
          "acceptWebPreviewCommerceRequest",
        );

        // The shared static RPC exists for Learning, but ZoeBuild no longer
        // wires its full-stack preview through that browser callback.
        expect(shell).not.toContain("requestStaticPreviewCommerce");
        expect(shell).not.toContain("onCommerceRequest={");

        expect(
          route,
        ).toContain(
          "enforceSameOriginPost",
        );

        expect(
          route,
        ).toContain(
          "loadCurrentBuildAccessSnapshot",
        );

        expect(
          route,
        ).toContain(
          "getBuildProjectCommand",
        );
      },
    );

    it(
      "routes only public provider-neutral operations into existing preview commerce services",
      () => {
        for (
          const method of [
            "products.list",
            "products.get",
            "cart.get",
            "cart.add",
            "cart.update",
            "cart.remove",
            "checkout.begin",
          ]
        ) {
          expect(
            bridge,
          ).toContain(
            `"${method}"`,
          );

          expect(
            route,
          ).toContain(
            `"${method}"`,
          );
        }

        expect(
          route,
        ).toContain(
          "listCommerceProducts",
        );

        expect(
          route,
        ).toContain(
          "getCommerceProduct",
        );

        expect(
          route,
        ).toContain(
          "parseNativeCommerceCartCommand",
        );

        expect(
          route,
        ).toContain(
          "executeCommerceCartCommand",
        );

        expect(
          route,
        ).toContain(
          "parseCommerceCheckoutRequest",
        );

        expect(
          route,
        ).toContain(
          "beginCommerceCheckout",
        );

        expect(
          route.match(
            /surface:\s*"preview"/g,
          )?.length,
        ).toBeGreaterThanOrEqual(
          4,
        );

        expect(
          route,
        ).not.toContain(
          'surface:\n          "published"',
        );
      },
    );

    it(
      "never exposes provider credentials or browser provider/environment choice",
      () => {
        for (
          const text of [
            route,
            shell,
            bridge,
          ]
        ) {
          expect(
            text,
          ).not.toContain(
            "credentialsSecretRef",
          );

          expect(
            text,
          ).not.toContain(
            "webhookSecretRef",
          );

          expect(
            text,
          ).not.toContain(
            "secretKey",
          );

          expect(
            text,
          ).not.toContain(
            "sk_test_",
          );

          expect(
            text,
          ).not.toContain(
            "sk_live_",
          );
        }

        expect(
          bridge,
        ).not.toContain(
          "paymentProvider",
        );

        expect(
          bridge,
        ).not.toContain(
          "environment",
        );
      },
    );

    it(
      "keeps the retired shared renderer opaque while ZoeBuild uses TanStack preview",
      () => {
        expect(
          shell,
        ).toContain(
          "commerceEnabled",
        );

        expect(shell).toContain("preview={fullStackPreview}");
        expect(shell).not.toContain("<WebPreview");

        expect(
          preview,
        ).toContain(
          'sandbox="allow-scripts allow-forms allow-modals"',
        );

        expect(
          preview,
        ).not.toContain(
          "allow-same-origin",
        );

        expect(
          bridge,
        ).not.toContain(
          '"use client"',
        );

        expect(
          preview,
        ).toContain(
          "notifyCommerceReady",
        );

        expect(
          bridge,
        ).toContain(
          "await hostReadyPromise",
        );

        expect(
          bridge,
        ).toContain(
          "ensureEphemeralStorage",
        );

        expect(
          bridge,
        ).toContain(
          '"localStorage"',
        );

        expect(
          bridge,
        ).toContain(
          '"sessionStorage"',
        );

        expect(
          preview,
        ).toContain(
          'sandbox="allow-scripts allow-forms allow-modals"',
        );

        expect(
          preview,
        ).not.toContain(
          'sandbox="allow-scripts allow-forms allow-modals allow-same-origin"',
        );

        expect(
          bridge,
        ).not.toContain(
          "/api/build/",
        );
      },
    );
  },
);
