import { describe, expect, it } from "vitest";
import {
  BUILD_STACKS_V1,
  getBuildStack,
  requireBuildStack,
} from "./index";

describe("build registry", () => {
  it("registers only the two initial provider-neutral web stacks", () => {
    expect(BUILD_STACKS_V1.map((stack) => stack.id)).toEqual([
      "static-html-v1",
      "react-vite-v1",
    ]);

    const serialized = JSON.stringify(BUILD_STACKS_V1).toLowerCase();
    for (const provider of [
      "cloudflare",
      "neon",
      "stripe",
      "square",
      "openai",
      "expo",
      "vercel",
      "github",
    ]) {
      expect(serialized).not.toContain(provider);
    }
  });

  it("keeps managed backend capability disabled in the initial registry", () => {
    for (const stack of BUILD_STACKS_V1) {
      expect(stack.supportedCapabilities).toEqual([]);
    }
  });

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
