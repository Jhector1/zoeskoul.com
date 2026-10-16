import { describe, expect, it } from "vitest";
import {
  BUILD_TEMPLATES_V1,
  getBuildTemplate,
  requireBuildTemplate,
} from "./index";

describe("build template registry", () => {
  it(
    "registers the controlled deterministic templates",
    () => {
      expect(
        BUILD_TEMPLATES_V1.map(
          (template) =>
            template.id,
        ),
      ).toEqual([
        "commerce-static-v1",
        "commerce-react-vite-v1",
        "static-html-v1",
        "react-vite-v1",
      ]);
    },
  );


  it("keeps static projects dependency-free and React dependency locking explicit", () => {
    expect(getBuildTemplate("static-html-v1")?.dependencyLock).toBeNull();
    expect(getBuildTemplate("react-vite-v1")?.dependencyLock).toEqual({
      manager: "pnpm",
      policy: "generate-once",
      lockfilePath: "pnpm-lock.yaml",
    });
  });

  it("fails closed for unknown template ids", () => {
    expect(() => requireBuildTemplate("unknown-template")).toThrow(
      "Unsupported ZoeBuild template",
    );
  });
});
