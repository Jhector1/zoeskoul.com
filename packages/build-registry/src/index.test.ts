import { describe, expect, it } from "vitest";
import {
  BUILD_STACKS_V1,
  getBuildStack,
  requireBuildStack,
} from "./index";

describe("build registry", () => {
  it(
    "registers the controlled provider-neutral web stacks",
    () => {
      expect(
        BUILD_STACKS_V1.map(
          (stack) => stack.id,
        ),
      ).toEqual([
        "commerce-storefront-v1",
        "static-html-v1",
        "react-vite-v1",
      ]);
    },
  );
  it(
    "keeps platform backend capabilities disabled while commerce delegates only payments and commerce",
    () => {
      const byId =
        new Map(
          BUILD_STACKS_V1.map(
            (stack) => [
              stack.id,
              stack,
            ],
          ),
        );

      expect(
        byId.get(
          "static-html-v1",
        )?.supportedCapabilities,
      ).toEqual([]);

      expect(
        byId.get(
          "react-vite-v1",
        )?.supportedCapabilities,
      ).toEqual([]);

      const commerce =
        byId.get(
          "commerce-storefront-v1",
        );

      expect(
        commerce
          ?.supportedCapabilities,
      ).toEqual([
        "payments",
        "commerce",
      ]);

      for (
        const capability of [
          "backend",
          "database",
          "auth",
          "storage",
          "email",
        ] as const
      ) {
        expect(
          commerce
            ?.supportedCapabilities,
        ).not.toContain(
          capability,
        );
      }
    },
  );


  it("looks up supported stacks and fails closed for unknown ids", () => {
    expect(getBuildStack("react-vite-v1")?.preview).toEqual({
      type: "server",
      port: 5173,
    });
    expect(() => requireBuildStack("unknown-stack")).toThrow(
      "Unsupported ZoeBuild stack",
    );
  });
});
