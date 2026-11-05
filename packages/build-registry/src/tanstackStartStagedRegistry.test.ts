import { describe, expect, it } from "vitest";
import { TANSTACK_START_STACK_V1, BUILD_STACKS_V1, getBuildStack } from "./index";

describe("canonical TanStack Start runtime", () => {
  it("is the only active project stack", () => {
    expect(BUILD_STACKS_V1).toEqual([TANSTACK_START_STACK_V1]);
    expect(getBuildStack(TANSTACK_START_STACK_V1.id)).toBe(TANSTACK_START_STACK_V1);
    expect(TANSTACK_START_STACK_V1.commands.install).toEqual(["pnpm", "install", "--frozen-lockfile"]);
    expect(TANSTACK_START_STACK_V1.artifact.type).toBe("worker-bundle");
  });
});
