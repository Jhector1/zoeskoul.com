import { describe, expect, it } from "vitest";
import { getBuildTemplate, listBuildTemplates } from "./index";

describe("TanStack Start-only V1 project architecture", () => {
  it("has a single full-stack source template for websites and storefronts", () => {
    expect(listBuildTemplates().map(template => template.id)).toEqual(["tanstack-start-v1"]);
    const template = getBuildTemplate("tanstack-start-v1");
    expect(template?.files.map(file => file.path)).toContain("src/routes/__root.tsx");
    expect(template?.dependencyLock?.manager).toBe("pnpm");
    for (const old of ["static-html-v1", "react-vite-v1", "commerce-static-v1", "commerce-react-vite-v1"]) {
      expect(getBuildTemplate(old)).toBeUndefined();
    }
  });
});
