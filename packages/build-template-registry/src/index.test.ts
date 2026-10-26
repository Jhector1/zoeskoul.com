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

describe("V12K3 React route bootstrap", () => {
  it("includes a route entry in both React templates without adding dependencies", () => {
    for (const templateId of ["react-vite-v1", "commerce-react-vite-v1"]) {
      const template = requireBuildTemplate(templateId);
      const main = template.files.find(file => file.path === "src/main.tsx")?.content ?? "";
      const router = template.files.find(file => file.path === "src/ZoePages.tsx")?.content ?? "";
      expect(main).toContain('import ZoePages from "./ZoePages"');
      expect(main).toContain("<ZoePages />");
      expect(router).toContain("// @zoebuild-pages-v1");
      expect(router).toContain('window.addEventListener("popstate"');
      expect(router).toContain('document.addEventListener("click",onInternalLink,true)');
      expect(router).toContain('useLayoutEffect(()=>{');
      expect(router).toContain('link.setAttribute("href",routed)');
      expect(router).toContain('new MutationObserver(repairLinks)');
      expect(router).not.toContain('aria-label="Pages"');
      expect(template.dependencyLock?.policy).toBe("generate-once");
    }
  });
});
