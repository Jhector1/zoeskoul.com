import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repo, `apps/zoebuild/src/${path}`), "utf8");
const directory = read("components/builder/ProviderDirectory.tsx");
const css = read("components/builder/ProviderDirectory.module.css");
const settings = read("app/[locale]/projects/[buildProjectId]/SiteSettingsWorkspacePanel.tsx");
const commerce = read("app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx");

describe("ZoeBuild E13D one reusable provider card across categories", () => {
  it("uses exactly one shared directory/card component for all provider categories", () => {
    expect(directory).toContain("styles.card");
    expect(directory).toContain("data-status={status}");
    expect(directory).toContain("onOpen(provider.id)");
    expect(settings).toContain("<ProviderDirectory");
    expect(commerce).toContain("<ProviderDirectory");
  });
  it("keeps solid actionable cards and dashed, modestly faded unavailable cards", () => {
    expect(css).toMatch(/\.card\s*\{[\s\S]*?border:\s*1px solid/);
    expect(css).toMatch(/\.card\[data-status="unavailable"\]\s*\{[\s\S]*?border-style:\s*dashed/);
    expect(css).toMatch(/\.card\[data-status="unavailable"\]\s*\{[\s\S]*?opacity:\s*\.80/);
    expect(css).toMatch(/\.card\[data-status="checking"\]\s*\{[\s\S]*?border-style:\s*solid/);
    expect(css).not.toMatch(/\.card:disabled\s*\{[^}]*border-style:\s*dashed/);
    expect(directory).toContain('status === "unavailable" || status === "checking"');
  });
  it("retains identical dimensions, hover affordances, and accessible disabled state", () => {
    expect(css).toContain("min-height: 180px");
    expect(css).toContain("border-radius: 12px");
    expect(css).toContain(".card:hover:not(:disabled)");
    expect(directory).toContain("disabled={disabled}");
    expect(directory).toContain("aria-label={`${provider.name}: ${STATUS[status]}`}");
  });
});
