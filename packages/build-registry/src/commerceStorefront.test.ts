import { describe, expect, it } from "vitest";
import { BUILD_STACKS_V1 } from "./index";

describe("TanStack commerce capability", () => {
  it("uses the same framework as every other ZoeBuild project", () => {
    expect(BUILD_STACKS_V1).toHaveLength(1);
    expect(BUILD_STACKS_V1[0]).toMatchObject({
      id: "tanstack-start-v1",
      commerceRuntime: "tanstack-start",
      supportedCapabilities: ["backend", "payments", "commerce"],
    });
  });
});
