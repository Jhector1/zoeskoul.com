import { describe, expect, it } from "vitest";
import { TANSTACK_START_STACK_V1 } from "./index";

describe("canonical full-stack build artifact", () => {
  it("keeps server code separate from published client assets", () => {
    expect(TANSTACK_START_STACK_V1.artifact).toEqual({
      type: "worker-bundle", outputPath: "dist/server",
      assetsPath: "dist/client", entrypoint: "index.js",
    });
    expect(TANSTACK_START_STACK_V1.deploymentAdapterId).toBe("cloudflare-workers-v1");
  });
});
