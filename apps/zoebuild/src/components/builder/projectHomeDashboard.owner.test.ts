import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../../app/[locale]/projects/page.tsx");
const menu = read("./ProjectCardActions.tsx");
const composer = read("./ZoeBuildPromptComposer.tsx");
const landing = read("./ZoeBuildLanding.tsx");

describe("ZoeBuild home and project dashboard UI", () => {
  it("keeps one shared composer and the explicit user-submitted plan request", () => {
    expect(landing.match(/<ZoeBuildPromptComposer\b/g)).toHaveLength(1);
    expect(landing).toContain('variant="home"');
    expect(landing).not.toContain("<ZoeBuildModeTabs");
    expect(landing).toContain("requestZoeBuildPlan(submission)");
    expect(composer).toContain('props.variant === "home" ? 40 : 36');
    expect(composer).toContain("submitInFlightRef.current");
  });
  it("uses a single home row with attachment, text, and trailing actions in order", () => {
    const css = read("./ZoeBuildPromptComposer.module.css");
    expect(composer).toMatch(/homeRow}[^]*?homeLeadingAction}>{addMedia}[^]*?{promptInput}[^]*?homeTrailingActions}[^]*?{recordVoice}[^]*?{buildButton}/);
    expect(composer).toContain('props.variant === "home" ? 200 : 144');
    expect(composer).toContain("new ResizeObserver");
    expect(css).toMatch(/\.homeRow\s*\{[^}]*min-height: 60px;[^}]*border-radius: 30px;/);
    expect(css).toMatch(/\.homeComposer :global\(\.zb-prompt-textarea\)\s*\{[^}]*min-height: 40px !important;/);
    expect(composer).toContain("composerStyles.homeCreditStatus");
  });
  it("keeps project navigation separate from the destructive action", () => {
    expect(page).toMatch(/<\/Link>\s*<ProjectCardActions[^>]*>\s*<DeleteBuildProjectButton variant="menu"/);
    expect(menu).toContain("<details");
    expect(menu).toContain("<summary");
    expect(menu).toContain('event.key === "Escape"');
    expect(page).not.toContain("<iframe");
  });
  it("preserves owner-scoped list reads and does not pretend a thumbnail exists", () => {
    expect(page).toContain("listBuildProjectsCommand({");
    expect(page).toContain("loadCurrentBuildAccessSnapshot()");
    expect(page).toContain("ProjectHomepageThumbnail");
    expect(page).toContain("/thumbnail/${project.sourceVersion}");
    expect(read("./ProjectHomepageThumbnail.tsx")).toContain("Homepage preview not captured");
    expect(read("./ProjectHomepageThumbnail.tsx")).toContain('loading="lazy"');
  });
  it("respects reduced motion and leaves the editor composer compact", () => {
    const landingCss = read("./ZoeBuildLanding.module.css");
    expect(landingCss).toContain("prefers-reduced-motion: reduce");
    for (const word of ["build", "design", "launch"]) {
      expect(landingCss).toContain(`zb-heading-${word} 7.2s ease-in-out infinite`);
    }
    expect(landingCss).toContain("display: inline-grid");
    expect(landingCss).not.toContain("zb-heading-rotate");
    expect(landing).toContain('aria-label="What will you build today?"');
    expect(landing).toContain("HOME_ACTION_WORDS");
    expect(composer).toContain("composerStyles.compactComposer");
  });
});


describe("thumbnail lifecycle UI",()=>{
  it("refreshes only the selected editor and never starts a dashboard renderer",()=>{
    const thumbnail=read("./ProjectHomepageThumbnail.tsx");
    const hook=read("./useReactDevelopmentPreview.ts");
    expect(menu).toContain("Refresh thumbnail");
    expect(page).toContain("?refreshThumbnail=${project.sourceVersion}");
    expect(thumbnail).toContain("?display=1");
    expect(thumbnail).toContain("Previous homepage");
    expect(thumbnail).not.toContain('method:"POST"');
    expect(thumbnail).not.toContain("/development/start");
    expect(hook).toContain("THUMBNAIL_MAX_ATTEMPTS");
    expect(hook).toContain('document.visibilityState!=="visible"');
  });
});
