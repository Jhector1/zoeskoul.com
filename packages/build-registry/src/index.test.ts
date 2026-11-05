import { describe, expect, it } from "vitest";
import { BUILD_STACKS_V1, getBuildStack, requireBuildStack } from "./index";

describe("TanStack-only build registry", () => {
  it("registers exactly one full-stack Worker architecture", () => {
    expect(BUILD_STACKS_V1.map((stack) => stack.id)).toEqual(["tanstack-start-v1"]);
    expect(getBuildStack("tanstack-start-v1")).toMatchObject({
      templateId: "tanstack-start-v1", runtimeProfileId: "build-worker-v1",
      artifact: { type: "worker-bundle", outputPath: "dist/server" },
    });
  });
  it("rejects former runtime IDs", () => {
    for (const legacy of ["static-html-v1", "react-vite-v1", "commerce-static-v1", "commerce-react-vite-v1"]) {
      expect(getBuildStack(legacy)).toBeUndefined();
      expect(() => requireBuildStack(legacy)).toThrow("Unsupported ZoeBuild stack");
    }
  });
});
