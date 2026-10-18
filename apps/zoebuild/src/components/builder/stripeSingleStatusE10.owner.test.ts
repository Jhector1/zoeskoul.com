import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const root = "src/app/[locale]/projects/[buildProjectId]/";
const read = (name: string) => readFileSync(resolve(app, root + name), "utf8");
const panel = read("StripeConnectionPanel.tsx");
const css = read("StripeConnectionPanel.module.css");

describe("ZoeBuild E10 single environment-ready icon", () => {
  it("places one green check next to each fully configured environment name only", () => {
    expect((panel.match(/<ReadyCheck \/>/g) || []).length).toBe(2);
    expect(panel).toContain('testStatus === "active" && testWebhookReady && previewPaymentsActive ? <ReadyCheck />');
    expect(panel).toContain('liveStatus === "active" && liveWebhookReady && publishedPaymentsActive ? <ReadyCheck />');
    expect(css).toContain(".readyCheck");
    expect(panel).toContain('aria-label="API key, webhook and payment routing configured"');
  });
  it("removes redundant configured and active text inside the panel", () => {
    for (const removed of ["Test API key configured", "Live API key configured", "Signing secret configured", "Preview payments active", "Live payments active", "ConfiguredCheck"]) {
      expect(panel).not.toContain(removed);
    }
  });
  it("keeps test/live isolation, secret inputs, and inactive activation controls", () => {
    expect((panel.match(/type="password"/g) || []).length).toBe(4);
    expect((panel.match(/hidden={visibleEnvironment !== "test"}/g) || []).length).toBe(2);
    expect((panel.match(/hidden={visibleEnvironment !== "live"}/g) || []).length).toBe(2);
    expect(panel).toContain('visibleEnvironment === "test" && !previewPaymentsActive');
    expect(panel).toContain('visibleEnvironment === "live" && !publishedPaymentsActive');
    expect(panel).toContain('!testWebhookReady');
    expect(panel).toContain('!liveWebhookReady');
    expect(panel).toContain('capabilities: [');
    expect(panel).not.toContain("localStorage");
    expect(panel).not.toContain("sessionStorage");
  });
  it("keeps environment tabs accessible and unclipped", () => {
    expect(panel).toContain('aria-label="Stripe environment"');
    expect(panel).toContain('aria-pressed={visibleEnvironment === "test"}');
    expect(panel).toContain('aria-pressed={visibleEnvironment === "live"}');
    expect(css).toContain('overflow: visible !important;');
    expect(css).toContain('.panel :global([hidden]) { display: none !important; }');
  });
});
