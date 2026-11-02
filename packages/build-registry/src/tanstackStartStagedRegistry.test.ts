import { describe, expect, it } from "vitest";
import { TANSTACK_START_STACK_V1, BUILD_STACKS_V1, getBuildStack } from "./index";

// Build registry tests must not reach across package boundaries to the template
// registry. Each package verifies its own registration and exposure contract.
describe("TanStack Start target stack is declared but not active", () => {
  it("declares one full-stack target with a Worker artifact", () => {
    expect(TANSTACK_START_STACK_V1.templateId).toBe("tanstack-start-v1");
    expect(TANSTACK_START_STACK_V1.artifact).toEqual({
      type: "worker-bundle", outputPath: "dist/server", assetsPath: "dist/client", entrypoint: "index.js",
    });
    expect(TANSTACK_START_STACK_V1.commands.install).toEqual(["pnpm", "install", "--frozen-lockfile"]);
    expect(TANSTACK_START_STACK_V1.supportedCapabilities).toEqual(["backend"]);
  });

  it("does not prematurely activate the unverified SSR runner or publisher", () => {
    expect(BUILD_STACKS_V1.some(stack => stack.id === TANSTACK_START_STACK_V1.id)).toBe(false);
    expect(getBuildStack(TANSTACK_START_STACK_V1.id)).toBeUndefined();
  });
});
