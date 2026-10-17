import { describe, expect, it } from "vitest";

import {
  ProviderPresetError,
  ProviderRegistry,
  materializeProviderPreset,
  type ProviderConnectionSnapshot,
  type ProviderPreset,
} from "./index";

type DemoCapability =
  | "demo.alpha"
  | "demo.beta";

describe("provider platform", () => {
  it("registers arbitrary providers without a hard-coded provider union", () => {
    const registry =
      new ProviderRegistry<DemoCapability, string>();

    registry.register({
      manifest: {
        key: "merchant-custom-provider",
        displayName: "Merchant Custom Provider",
        connectionKinds: ["endpoint"],
        environments: ["test", "live"],
      },
      handlers: {
        "demo.alpha": "alpha-handler",
      },
    });

    expect(
      registry.getHandler(
        "merchant-custom-provider",
        "demo.alpha",
      ),
    ).toBe("alpha-handler");

    expect(
      registry.supports(
        "merchant-custom-provider",
        "demo.beta",
      ),
    ).toBe(false);
  });

  it("materializes presets into explicit connection routes", () => {
    const preset: ProviderPreset<DemoCapability> = {
      key: "recommended-demo",
      version: 1,
      label: "Recommended",
      description: "Demo preset",
      routes: [
        {
          capability: "demo.alpha",
          providerKey: "internal-demo",
        },
        {
          capability: "demo.beta",
          providerKey: "external-demo",
        },
      ],
    };

    const connections = new Map<
      string,
      ProviderConnectionSnapshot
    >([
      [
        "internal-demo",
        {
          id: "internal-test",
          providerKey: "internal-demo",
          environment: "test",
          kind: "internal",
          status: "active",
        },
      ],
      [
        "external-demo",
        {
          id: "external-test",
          providerKey: "external-demo",
          environment: "test",
          kind: "credentials",
          status: "active",
        },
      ],
    ]);

    const materialized = materializeProviderPreset({
      preset,
      scopeId: "project-1",
      environment: "test",
      resolveConnection: (route) =>
        connections.get(route.providerKey) ?? null,
    });

    expect(materialized.routes).toEqual([
      {
        scopeId: "project-1",
        environment: "test",
        capability: "demo.alpha",
        connectionId: "internal-test",
      },
      {
        scopeId: "project-1",
        environment: "test",
        capability: "demo.beta",
        connectionId: "external-test",
      },
    ]);
  });

  it("never falls back from live to test connections", () => {
    const preset: ProviderPreset<"demo.alpha"> = {
      key: "recommended-demo",
      version: 1,
      label: "Recommended",
      description: "Demo preset",
      routes: [
        {
          capability: "demo.alpha",
          providerKey: "payments",
        },
      ],
    };

    expect(() =>
      materializeProviderPreset({
        preset,
        scopeId: "project-1",
        environment: "live",
        resolveConnection: () => ({
          id: "payments-test",
          providerKey: "payments",
          environment: "test",
          kind: "credentials",
          status: "active",
        }),
      }),
    ).toThrow(ProviderPresetError);
  });

  it("does not permit unresolved preset routes to become implicit defaults", () => {
    const preset: ProviderPreset<"demo.alpha"> = {
      key: "recommended-demo",
      version: 1,
      label: "Recommended",
      description: "Demo preset",
      routes: [
        {
          capability: "demo.alpha",
          providerKey: "payments",
        },
      ],
    };

    expect(() =>
      materializeProviderPreset({
        preset,
        scopeId: "project-1",
        environment: "test",
        resolveConnection: () => null,
      }),
    ).toThrow(
      /could not resolve an explicit connection/,
    );
  });
});
