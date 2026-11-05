import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifyBuildRequest,
  resolveBuildModelRoute,
} from "./index";

describe(
  "ZoeBuild deterministic cost-aware routing",
  () => {
    it(
      "recognizes a clothing ecommerce store without spending an AI call",
      () => {
        const profile =
          classifyBuildRequest(
            "Generate an ecommerce for clothes with a catalog, cart and checkout.",
          );

        expect(
          profile,
        ).toMatchObject({
          siteKind:
            "ecommerce",
          industry:
            "fashion",
          complexity:
            "standard",
          commerceMode:
            "cart-checkout",
          commerce: {
            storefrontRuntime:
              "tanstack-start",
          },
          projectType:
            "fullstack-app",
          deploymentPreference:
            "managed-runtime",
          stackId:
            "tanstack-start-v1",
          supported:
            true,
        });

        expect(
          profile.requirements,
        ).toMatchObject({
          auth: false,
          payments: true,
          commerce: true,
        });

        expect(
          profile.staticResponsibilities,
        ).toContain(
          "checkout mechanics",
        );

        expect(
          profile.dynamicResponsibilities,
        ).toContain(
          "storefront visual hierarchy",
        );
      },
    );

    it(
      "separates a multi-vendor marketplace from an ordinary store",
      () => {
        const profile =
          classifyBuildRequest(
            "Build an Etsy-like marketplace where multiple vendors sell products and I take commission.",
          );

        expect(
          profile.siteKind,
        ).toBe(
          "marketplace",
        );

        expect(
          profile.complexity,
        ).toBe(
          "complex",
        );

        expect(
          profile.supported,
        ).toBe(false);
      },
    );

    it(
      "routes a photographer portfolio to TanStack Start",
      () => {
        expect(
          classifyBuildRequest(
            "Build a clean freelance photographer portfolio.",
          ),
        ).toMatchObject({
          siteKind:
            "portfolio",
          projectType:
            "fullstack-app",
          stackId:
            "tanstack-start-v1",
          supported:
            true,
        });
      },
    );

    it(
      "fails closed when a database and login integration is unavailable",
      () => {
        const profile =
          classifyBuildRequest(
            "Build a dashboard with login and a database.",
          );

        expect(
          profile.projectType,
        ).toBe(
          "fullstack-app",
        );

        expect(
          profile.stackId,
        ).toBeNull();

        expect(
          profile.supported,
        ).toBe(false);
      },
    );

    it("runs ordinary API-backed apps on TanStack without a second stack", () => {
      const profile = classifyBuildRequest("Build a web app with a backend API.");
      expect(profile).toMatchObject({
        projectType: "fullstack-app",
        stackId: "tanstack-start-v1",
        deploymentPreference: "managed-runtime",
        supported: true,
      });
      expect(profile.requirements.backend).toBe(true);
    });

    it(
      "uses Luna first for normal text/image work and keeps Sol as escalation",
      () => {
        const profile =
          classifyBuildRequest(
            "Build a business landing page.",
          );

        const route =
          resolveBuildModelRoute(
            profile,
            ["image"],
          );

        expect(
          route.candidates.map(
            (candidate) =>
              [
                candidate.provider,
                candidate.model,
              ],
          ),
        ).toEqual([
          [
            "openai",
            "gpt-6-luna",
          ],
          [
            "gemini",
            "gemini-3.1-flash-lite",
          ],
          [
            "openai",
            "gpt-6.1-sol",
          ],
        ]);
      },
    );

    it(
      "uses Gemini Flash-Lite before stronger Gemini for raw audio/video",
      () => {
        const profile =
          classifyBuildRequest(
            "Build a bakery website.",
          );

        const route =
          resolveBuildModelRoute(
            profile,
            ["audio"],
          );

        expect(
          route.candidates[0],
        ).toMatchObject({
          provider:
            "gemini",
          model:
            "gemini-3.1-flash-lite",
          tier:
            "economy",
        });
      },
    );
    it(
      "routes presentation-rich commerce to the same TanStack stack",
      () => {
        const profile =
          classifyBuildRequest(
            "Build a fashion ecommerce store with product filters, product search, cart and checkout.",
          );

        expect(profile.supported).toBe(true);
        expect(profile.stackId).toBe(
          "tanstack-start-v1",
        );
        expect(profile.commerce).toEqual({
          storefrontRuntime: "tanstack-start",
        });
      },
    );

    it(
      "fails closed when the ecommerce request explicitly requires buyer accounts",
      () => {
        const profile =
          classifyBuildRequest(
            "Build a clothing store with customer accounts, saved addresses and order history.",
          );

        expect(
          profile.siteKind,
        ).toBe(
          "ecommerce",
        );

        expect(
          profile.requirements.auth,
        ).toBe(true);

        expect(
          profile.commerce,
        ).toEqual({
          storefrontRuntime:
            "tanstack-start",
        });

        expect(
          profile.stackId,
        ).toBeNull();

        expect(
          profile.supported,
        ).toBe(false);

        expect(
          profile.unsupportedReason,
        ).toMatch(
          /Customer Account API/,
        );
      },
    );


  },
);
