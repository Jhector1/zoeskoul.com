import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hasReactCommerceCapability } from "./reactCommerceCapability";

const enabled = { stackId: "react-vite-v1", specification: {
  requirements: { commerce: true }, commerce: { storefrontRuntime: "react-vite" },
}};

describe("V12K12I React commerce capability and owner-scoped preview", () => {
  it("enables storefront commerce only with both canonical stack and capability spec", () => {
    expect(hasReactCommerceCapability(enabled)).toBe(true);
    expect(hasReactCommerceCapability({ ...enabled, specification: null })).toBe(false);
    expect(hasReactCommerceCapability({ ...enabled, specification: {
      requirements: {commerce: false}, commerce: {storefrontRuntime: "react-vite"},
    }})).toBe(false);
    expect(hasReactCommerceCapability({ ...enabled, specification: {
      requirements: {commerce: true}, commerce: {storefrontRuntime: "static"},
    }})).toBe(false);
    for (const stackId of ["static-html-v1", "commerce-static-v1", "commerce-react-vite-v1", null]) {
      expect(hasReactCommerceCapability({ ...enabled, stackId })).toBe(false);
    }
  });
  it("uses the same capability in the owner-scoped preview and project UI", () => {
    const root = new URL("../../", import.meta.url);
    const route = readFileSync(new URL("app/api/build/projects/[buildProjectId]/commerce/preview/route.ts", root), "utf8");
    const projectPage = readFileSync(new URL("app/[locale]/projects/[buildProjectId]/page.tsx", root), "utf8");
    const shell = readFileSync(new URL("app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", root), "utf8");
    const settings = readFileSync(new URL("app/[locale]/projects/[buildProjectId]/SiteSettingsWorkspacePanel.tsx", root), "utf8");
    const panel = readFileSync(new URL("app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx", root), "utf8");
    expect(route).toContain("hasReactCommerceCapability(authorization.project)");
    expect(route).toContain("await authorizeProject(");
    expect(projectPage).toContain("commerceEnabled={hasReactCommerceCapability(project)}");
    expect(shell).toContain("const commerceEnabled = props.commerceEnabled;");
    expect(settings).toContain("commerceEnabled={props.commerceEnabled}");
    expect(panel).toContain('"react-vite-v1"');
    for (const old of ['"commerce-static-v1"', '"commerce-react-vite-v1"']) {
      expect(route).not.toContain(old);
      expect(shell).not.toContain(old);
      expect(panel).not.toContain(old);
    }
  });
});
