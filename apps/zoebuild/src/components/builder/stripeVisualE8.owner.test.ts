import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const read = (path: string) => readFileSync(resolve(app, path), "utf8");
const root = "src/app/[locale]/projects/[buildProjectId]/";
const shell = read(`${root}ProjectBuilderShell.tsx`);
const receipt = read(`${root}StripeCheckoutReturnNotice.tsx`);
const receiptCss = read(`${root}StripeCheckoutReturnNotice.module.css`);
const stripe = read(`${root}StripeConnectionPanel.tsx`);
const stripeCss = read(`${root}StripeConnectionPanel.module.css`);

describe("ZoeBuild E8 checkout receipt and Stripe visual ownership", () => {
  it("keeps the project stage as two grid rows and mounts the receipt inside its topbar", () => {
    expect(shell).not.toContain('<StripeCheckoutReturnNotice buildProjectId={props.project.buildProjectId} />\n        <div className="zb-project-stage-body">');
    const topbar = shell.slice(shell.indexOf('className="zb-project-modebar"'), shell.indexOf('<div className="zb-project-stage-body">'));
    expect(topbar).toContain('commerceEnabled && !settingsOpen && mode === "preview"');
    expect(topbar).toContain('<StripeCheckoutReturnNotice buildProjectId={props.project.buildProjectId} />');
    expect(receiptCss).toContain("position: absolute;");
    expect(receiptCss).toContain("top: calc(100% + 12px);");
  });
  it("only displays verified success from paid and committed order state", () => {
    expect(receipt).toContain('order.confirmed && order.paymentStatus === "paid"');
    expect(receipt).toContain('order.committedCount === order.reservationCount');
    expect(receipt).toContain('ZoeStore confirmed this order in the database');
    expect(receipt).toContain("Recheck order");
  });
  it("allows dismissing stale checkout status without leaving an oversized panel", () => {
    expect(receipt).toContain('url.searchParams.delete("checkout")');
    expect(receipt).toContain('url.searchParams.delete("orderId")');
    expect(receipt).toContain('window.history.replaceState');
    expect(receipt).toContain('aria-label="Dismiss checkout status"');
    expect(receiptCss).toContain("var(--zb-surface)");
    expect(receiptCss).toContain("var(--zb-border)");
  });
  it("uses a single server-derived green check per complete environment", () => {
    expect(stripe).toContain('testStatus === "active" && testWebhookReady && previewPaymentsActive ? <ReadyCheck />');
    expect(stripe).toContain('liveStatus === "active" && liveWebhookReady && publishedPaymentsActive ? <ReadyCheck />');
    expect(stripe).toContain('StripeConnectionPanel.module.css');
    expect(stripeCss).toContain("var(--zb-surface)");
    expect(stripeCss).toContain("var(--zb-bg)");
    expect(stripeCss).toContain(".readyCheck");
  });
});
