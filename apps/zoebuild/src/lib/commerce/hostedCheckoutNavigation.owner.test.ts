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
  "ZoeBuild hosted checkout navigation ownership",
  () => {
    const shell =
      source(
        "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
      );

    const preview =
      source(
        "packages/learner-workspace/src/runner/components/WebPreview.tsx",
      );

    const stripe =
      source(
        "apps/zoebuild/src/lib/commerce/stripeCommerceCheckout.ts",
      );

    const returnGateway =
      source(
        "apps/zoebuild/src/app/projects/[buildProjectId]/page.tsx",
      );

    it(
      "keeps hosted Checkout navigation in the authenticated parent for static Preview",
      () => {
        const request =
          shell.indexOf(
            "async function requestStaticPreviewCommerce",
          );

        const checkout =
          shell.indexOf(
            'request.method ===\n        "checkout.begin"',
            request,
          );

        const topLevelRedirect =
          shell.indexOf(
            "window.location.assign(",
            checkout,
          );

        const suppressResponse =
          shell.indexOf(
            "new Promise<never>",
            topLevelRedirect,
          );

        expect(request).toBeGreaterThan(-1);
        expect(checkout).toBeGreaterThan(request);
        expect(topLevelRedirect).toBeGreaterThan(checkout);
        expect(suppressResponse).toBeGreaterThan(topLevelRedirect);

        expect(
          shell,
        ).toContain(
          'checkout.protocol !==\n        "https:"',
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
          preview,
        ).not.toContain(
          "allow-top-navigation",
        );
      },
    );

    it(
      "keeps provider identity and credentials out of Preview navigation",
      () => {
        expect(shell).not.toContain("checkout.stripe.com");
        expect(shell).not.toContain("paymentProvider");
        expect(shell).not.toContain("sk_test_");
        expect(shell).not.toContain("sk_live_");
      },
    );

    it(
      "makes the existing preview return path a locale-aware gateway",
      () => {
        expect(
          stripe,
        ).toContain(
          '? `/projects/${encodeURIComponent(',
        );

        expect(
          returnGateway,
        ).toContain(
          'from "@zoeskoul/app-config"',
        );

        expect(
          returnGateway,
        ).toContain(
          "supportedLocales",
        );

        expect(
          returnGateway,
        ).toContain(
          '"accept-language"',
        );

        expect(
          returnGateway,
        ).toContain(
          'checkout ===\n      "success"',
        );

        expect(
          returnGateway,
        ).toContain(
          'checkout ===\n      "cancel"',
        );

        expect(
          returnGateway,
        ).toContain(
          "query.orderId",
        );

        expect(
          returnGateway,
        ).not.toContain(
          "returnUrl",
        );

        expect(
          returnGateway,
        ).not.toContain(
          "redirectUrl",
        );
      },
    );

    it(
      "leaves published return routing on the published site surface",
      () => {
        expect(
          stripe,
        ).toContain(
          ': `/sites/${encodeURIComponent(',
        );
      },
    );
  },
);
