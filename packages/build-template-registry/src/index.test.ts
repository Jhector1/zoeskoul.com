import { describe, expect, it } from "vitest";
import { BUILD_TEMPLATES_V1, getBuildTemplate, requireBuildTemplate } from "./index";

describe("TanStack-only deterministic starter", () => {
  it("registers exactly one full-stack template", () => {
    expect(BUILD_TEMPLATES_V1.map((template) => template.id)).toEqual(["tanstack-start-v1"]);
    const starter = requireBuildTemplate("tanstack-start-v1");
    expect(starter.activePath).toBe("src/routes/index.tsx");
    expect(starter.files.some((file) => file.path === "src/routes/__root.tsx")).toBe(true);
    expect(starter.files.some((file) => file.path === "index.html")).toBe(false);
    expect(starter.dependencyLock?.policy).toBe("generate-once");
  });
  it("rejects old templates", () => {
    for (const old of ["static-html-v1", "react-vite-v1", "commerce-static-v1", "commerce-react-vite-v1"]) {
      expect(getBuildTemplate(old)).toBeUndefined();
    }
  });
});
