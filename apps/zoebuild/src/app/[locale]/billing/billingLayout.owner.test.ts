import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const read=(file:string)=>readFileSync(new URL(`./${file}`,import.meta.url),"utf8");
describe("V12J.28E billing page hierarchy",()=>{
 it("positions one-time purchase above balance and subscription",()=>{
  const page=read("BuilderBillingClient.tsx");
  const purchase=page.indexOf("<AiCreditPacksPanel locale={locale}/>");
  const wallet=page.indexOf("<AiCreditsPanel locale={locale}/>");
  const subscription=page.indexOf('<section aria-labelledby="builder-plan-heading"');
  expect(purchase).toBeGreaterThan(0);
  expect(wallet).toBeGreaterThan(purchase);
  expect(subscription).toBeGreaterThan(wallet);
 });
 it("prevents equal-height stretch of uneven columns",()=>{
  const page=read("BuilderBillingClient.tsx");
  expect(page).toContain('grid items-start gap-5 xl:grid-cols-2');
  expect(page).not.toContain('xl:grid-cols-[minmax(0,1fr)_minmax(350px,0.95fr)]');
 });
 it("keeps technical details collapsible and actual wallet data visible",()=>{
  const wallet=read("AiCreditsPanel.tsx");
  expect(wallet).toContain('formatCustomerCredits((BigInt(snapshot.subscriptionAvailableUnits)+BigInt(snapshot.purchasedAvailableUnits))');
  expect(wallet).toContain('View exact ledger units');
  expect(wallet).toContain('Activity & access details');
 });
 it("keeps live custom checkout disabled and existing Stripe safety checks intact",()=>{
  const packs=read("AiCreditPacksPanel.tsx");
  const custom=read("CustomAiCreditTopUp.tsx");
  expect(packs).toContain('catalog.mode!=="live"');
  expect(packs).toContain('hasTestOffer');
  expect(packs).toContain('getOrCreateCreditCheckoutAttempt');
  expect(custom).toContain('getOrCreateCustomCreditCheckoutAttempt');
  const policy=read("customAiCreditTopUpPolicy.ts");
  // The validator is shared by new and resumed checkouts. Require its exact
  // Stripe hostname check instead of searching the component for inline code.
  expect(custom).toContain("trustedStripeCheckoutUrl");
  expect(policy).toContain('target.protocol!=="https:"');
  expect(policy).toContain('target.hostname!=="checkout.stripe.com"');
  expect(policy).toContain('target.username||target.password');
 });
});
