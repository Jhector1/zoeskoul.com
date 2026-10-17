import {
  describe,
  expect,
  it,
} from "vitest";

import {
  ProviderRegistry,
  ProviderRegistryError,
} from "./index";

type DemoCapability =
  | "demo.alpha"
  | "demo.beta";

type DemoHandler = Readonly<{
  execute(): string;
}>;

describe(
  "provider execution environments",
  () => {
    it(
      "separates capability implementation from environment executability",
      () => {
        const registry =
          new ProviderRegistry<
            DemoCapability,
            DemoHandler
          >();

        registry.register({
          manifest: {
            key: "test-only",
            displayName: "Test only",
            connectionKinds: [
              "credentials",
            ],
            environments: [
              "test",
            ],
          },
          handlers: {
            "demo.alpha": {
              execute: () =>
                "alpha",
            },
          },
        });

        expect(
          registry.supports(
            "test-only",
            "demo.alpha",
          ),
        ).toBe(true);

        expect(
          registry.supportsInEnvironment(
            "test-only",
            "demo.alpha",
            "test",
          ),
        ).toBe(true);

        expect(
          registry.supportsInEnvironment(
            "test-only",
            "demo.alpha",
            "live",
          ),
        ).toBe(false);

        expect(
          registry.supportsInEnvironment(
            "test-only",
            "demo.beta",
            "test",
          ),
        ).toBe(false);
      },
    );

    it(
      "rejects registrations without an explicit execution environment",
      () => {
        const registry =
          new ProviderRegistry<
            DemoCapability,
            DemoHandler
          >();

        expect(() =>
          registry.register({
            manifest: {
              key: "missing-environment",
              displayName:
                "Missing environment",
              connectionKinds: [
                "credentials",
              ],
              environments: [],
            },
            handlers: {
              "demo.alpha": {
                execute: () =>
                  "alpha",
              },
            },
          }),
        ).toThrow(
          ProviderRegistryError,
        );
      },
    );

    it(
      "rejects duplicate execution environments",
      () => {
        const registry =
          new ProviderRegistry<
            DemoCapability,
            DemoHandler
          >();

        expect(() =>
          registry.register({
            manifest: {
              key: "duplicate-environment",
              displayName:
                "Duplicate environment",
              connectionKinds: [
                "credentials",
              ],
              environments: [
                "test",
                "test",
              ],
            },
            handlers: {
              "demo.alpha": {
                execute: () =>
                  "alpha",
              },
            },
          }),
        ).toThrow(
          ProviderRegistryError,
        );
      },
    );
  },
);
