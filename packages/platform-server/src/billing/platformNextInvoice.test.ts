import {describe,it,expect} from "vitest";
import {projectStripeNextInvoice} from "./platformNextInvoice";
const now=Date.parse("2026-10-21T00:00:00Z");
describe("Stripe upcoming invoice projection",()=>{
 it("uses only the invoice preview charge/date in Stripe's response",()=>{
   expect(projectStripeNextInvoice({next_payment_attempt:1795305600,amount_due:1525,currency:"usd"},now))
     .toMatchObject({nextBillingAmountMinor:1525,nextBillingCurrency:"usd"});
 });
 it("does not invent a renewal amount when Stripe has no preview",()=>{
   expect(projectStripeNextInvoice({},now).nextBillingDate).toBeNull();
   expect(projectStripeNextInvoice({period_start:100,amount_due:1525,currency:"usd"},now).nextBillingDate).toBeNull();
 });
 it("hides future invoices once Stripe schedules cancellation at period end",()=>{
   expect(projectStripeNextInvoice({period_start:1795305600,amount_due:1525,currency:"usd"},now,true).nextBillingDate).toBeNull();
 });
});
