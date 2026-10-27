import { describe, expect, it } from "vitest";
import { getBuildTemplate, listBuildTemplates } from "./index";

describe("React-only V1 project architecture", () => {
  it("has a single React + Vite source template for websites and storefronts", () => {
    expect(listBuildTemplates().map(template => template.id)).toEqual(["react-vite-v1"]);
    const template = getBuildTemplate("react-vite-v1");
    expect(template?.files.map(file => file.path)).toContain("src/routes/AppRoutes.tsx");
    expect(template?.dependencyLock?.manager).toBe("pnpm");
    for (const old of ["static-html-v1", "commerce-static-v1", "commerce-react-vite-v1"]) {
      expect(getBuildTemplate(old)).toBeUndefined();
    }
  });
});
