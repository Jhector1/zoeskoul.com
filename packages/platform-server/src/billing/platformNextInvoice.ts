/** Stripe invoice previews are estimates, not guarantees of future payment. */
export type StripeNextInvoiceEvidence = Readonly<{
  next_payment_attempt?:number|null;
  period_start?:number|null;
  amount_due?:number|null;
  currency?:string|null;
}>;
export function projectStripeNextInvoice(
  invoice:StripeNextInvoiceEvidence, nowMs=Date.now(), cancelAtPeriodEnd=false,
):Readonly<{nextBillingDate:string|null;nextBillingAmountMinor:number|null;nextBillingCurrency:string|null}>{
  const empty={nextBillingDate:null,nextBillingAmountMinor:null,nextBillingCurrency:null};
  if(cancelAtPeriodEnd)return empty;
  const seconds=invoice.next_payment_attempt ?? invoice.period_start;
  if(typeof seconds!=="number"||!Number.isFinite(seconds)||seconds*1000<=nowMs||
    !Number.isSafeInteger(invoice.amount_due)||typeof invoice.currency!=="string"||
    !/^[a-z]{3}$/.test(invoice.currency))return empty;
  return {nextBillingDate:new Date(seconds*1000).toISOString(),
    nextBillingAmountMinor:invoice.amount_due!,nextBillingCurrency:invoice.currency};
}
