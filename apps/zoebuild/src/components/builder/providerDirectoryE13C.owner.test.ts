import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repo, `apps/zoebuild/src/${path}`), "utf8");
const directory = read("components/builder/ProviderDirectory.tsx");
const css = read("components/builder/ProviderDirectory.module.css");
const commerce = read("app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx");
const siteSettings = read("app/[locale]/projects/[buildProjectId]/SiteSettingsWorkspacePanel.tsx");

describe("ZoeBuild E13C theme and navigation polish", () => {
  it("uses theme-relative colors and top-aligned layout rather than dark-only surfaces", () => {
    expect(css).toContain("grid-template-rows: max-content max-content");
    expect(css).toContain("align-content: start");
    expect(css).toContain("color: inherit");
    expect(css).toContain("color-mix(in srgb, currentColor");
    expect(css).not.toContain("background: #12151d");
    expect(css).not.toContain("color: #f8fafc");
    expect(css).not.toContain("opacity: .48");
  });
  it("preserves disabled providers and backend-owned connection status", () => {
    expect(directory).toContain('status === "unavailable" || status === "checking"');
    expect(directory).toContain("disabled={disabled}");
    expect(commerce).toContain("shopifyOAuthConfigured === true");
    expect(commerce).toContain('item.provider === "stripe" && item.status === "active"');
  });
  it("keeps provider back navigation compact and resets section scroll", () => {
    expect(commerce).toContain("directoryStyles.backButton");
    expect(commerce).toContain("directoryStyles.overview");
    expect(commerce).toContain("props.onNavigate?.()");
    expect(commerce).toContain('status === "built-in"');
    expect(siteSettings).toContain("contentRef.current.scrollTop = 0");
    expect(siteSettings).toContain("onNavigate={resetContentScroll}");
    expect(siteSettings).toContain("onClick={() => navigate(entry.id)}");
  });
});
