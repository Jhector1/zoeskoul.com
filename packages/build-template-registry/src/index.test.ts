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

describe("V12K11P modern React/Vite starter", () => {
  it("uses React Router, not hand-written history listeners, in both templates", () => {
    for (const templateId of ["react-vite-v1", "commerce-react-vite-v1"]) {
      const template = requireBuildTemplate(templateId);
      const byPath = new Map(template.files.map(file => [file.path, file.content]));
      const pkg = JSON.parse(byPath.get("package.json") ?? "{}");
      expect(pkg.dependencies["react-router"]).toBe("7.18.4");
      expect(byPath.has("src/ZoePages.tsx")).toBe(false);
      expect(byPath.get("src/main.tsx")).toContain("<BrowserRouter basename={getRouterBasename()}>");
      expect(byPath.get("src/routes/AppRoutes.tsx")).toContain("// @zoebuild-react-router-v1");
      expect(byPath.get("src/lib/routerBasename.ts")).toContain("/sites/");
      expect(byPath.get("src/pages/NotFound.tsx")).toContain('<Link to="/">');
      expect(template.dependencyLock?.policy).toBe("generate-once");
    }
  });
  it("gives normal websites real shared layout, typed content and custom-hook folders", () => {
    const paths = new Set(requireBuildTemplate("react-vite-v1").files.map(file => file.path));
    for (const path of ["src/layouts/SiteLayout.tsx", "src/components/SiteHeader.tsx",
      "src/components/SiteFooter.tsx", "src/hooks/useDocumentTitle.ts", "src/data/site.ts", "src/pages/about.tsx"]) {
      expect(paths.has(path)).toBe(true);
    }
    const byPath = new Map(requireBuildTemplate("react-vite-v1").files.map(file => [file.path, file.content]));
    expect(byPath.get("src/components/SiteHeader.tsx")).toContain("NavLink");
    expect(byPath.get("src/layouts/SiteLayout.tsx")).toContain("<Outlet />");
  });
  it("keeps commerce provider ownership in its existing App without double page chrome", () => {
    const routes = requireBuildTemplate("commerce-react-vite-v1").files.find(f => f.path === "src/routes/AppRoutes.tsx")?.content ?? "";
    expect(routes).not.toContain("SiteLayout");
  });
});
