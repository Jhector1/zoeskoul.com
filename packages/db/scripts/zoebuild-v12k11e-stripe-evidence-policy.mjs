import {createHash} from 'node:crypto';

export class StripeEvidenceError extends Error {
  constructor(code) { super(code); this.name = 'StripeEvidenceError'; }
}
function check(ok, code) { if (!ok) throw new StripeEvidenceError(code); }
function integer(value) { return typeof value === 'bigint' ? value : BigInt(value); }
const stable = x => JSON.stringify(x);

/** Pure evidence evaluator. Inputs are already independently read from Stripe and PostgreSQL. */
export function evaluateStripeCreditEvidence(e, {stage='funded', expectedFingerprint=null, eventId=null}={}) {
  check(['funded','replay','refund','dispute'].includes(stage), 'PHASE_INVALID');
  const {session:s, price, payment:p, charge:c, items, attempt:a, mappedUserId, lot:l,
    entries, wallet:w, webhooks, riskEvents, reversalSnapshots} = e;
  check(s?.livemode === false && s.id?.startsWith('cs_test_') && s.mode === 'payment' &&
    s.status === 'complete' && s.payment_status === 'paid' &&
    s.currency === 'usd' && s.amount_total === 500 && s.amount_subtotal === 500 &&
    s.total_details?.amount_discount === 0 && s.total_details?.amount_tax === 0 &&
    s.metadata?.zoebuildAiCreditPurchase === 'v1', 'CHECKOUT_NOT_EXACT_PAID_TEST_PACK');
  check(Array.isArray(items?.data) && items.data.length === 1 && items.has_more === false &&
    items.data[0].quantity === 1 && items.data[0].price?.id === price?.id &&
    items.data[0].amount_total === 500 && items.data[0].amount_subtotal === 500 &&
    price.livemode === false && price.active && price.currency === 'usd' &&
    price.unit_amount === 500 && price.type === 'one_time' &&
    price.billing_scheme === 'per_unit' && !price.recurring && !price.custom_unit_amount,
    'STRIPE_PRICE_OR_ITEMS_INVALID');
  const customerId = typeof s.customer === 'string' ? s.customer : s.customer?.id;
  const intentId = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
  check(!!customerId && !!intentId &&
    s.metadata?.creditPackPriceId === price.id &&
    s.metadata?.checkoutAttemptId === a?.attemptId &&
    a.stripeSessionId === s.id && a.customerId === customerId && a.priceId === price.id &&
    a.userId === mappedUserId && !!mappedUserId, 'CHECKOUT_DB_PROVENANCE_MISMATCH');
  const chargedId = typeof c?.payment_intent === 'string' ? c.payment_intent : c?.payment_intent?.id;
  check(p?.id === intentId && p.livemode === false && p.status === 'succeeded' &&
    p.amount === 500 && p.amount_received === 500 && p.currency === 'usd' &&
    c?.id?.startsWith('ch_') && chargedId === p.id && c.livemode === false &&
    c.paid === true && c.captured === true && c.amount === 500 && c.currency === 'usd' &&
    Number.isSafeInteger(c.amount_refunded) && c.amount_refunded >= 0 && c.amount_refunded <= 500,
    'PAYMENT_INTENT_OR_CHARGE_INVALID');
  check(l?.kind === 'purchased' && l.userId === mappedUserId &&
    l.sourceKey === `stripe:zoebuild:pi:${intentId}` && integer(l.grantedUnits) === 500000n,
    'FUNDING_LOT_NOT_VERIFIED');
  check(Array.isArray(entries) && entries.filter(x=>x.kind==='grant').length === 1 &&
    entries.find(x=>x.kind==='grant')?.availableDelta === 500000n &&
    entries.every(x=>x.userId===mappedUserId && x.lotId===l.id), 'GRANT_LEDGER_INVALID');
  const sum = field => entries.reduce((acc,x)=>acc + integer(x[field]), 0n);
  check(sum('availableDelta') === integer(l.availableUnits) &&
    sum('reservedDelta') === integer(l.reservedUnits) &&
    sum('consumedDelta') === integer(l.consumedUnits) &&
    sum('expiredDelta') === integer(l.expiredUnits) &&
    sum('reversedDelta') === integer(l.reversedUnits) &&
    integer(l.availableUnits) + integer(l.reservedUnits) + integer(l.consumedUnits) +
      integer(l.expiredUnits) + integer(l.reversedUnits) === integer(l.grantedUnits),
    'LOT_LEDGER_CONSERVATION_FAILED');
  check(webhooks.some(x=>['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(x.type) &&
    x.objectId===s.id && x.livemode===false && x.status==='processed'),
    'SIGNED_WEBHOOK_NOT_PROCESSED');
  check(new Set(webhooks.map(x=>x.id)).size===webhooks.length &&
    new Set(entries.map(x=>x.eventKey)).size===entries.length,
    'DUPLICATE_FINANCIAL_IDENTITIES');
  if(eventId) check(webhooks.some(x=>x.id===eventId && x.status==='processed' &&
      ['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(x.type)),
      'CHECKOUT_WEBHOOK_EVENT_NOT_PROCESSED');
  const refunded = BigInt(c.amount_refunded);
  const target = 500000n * refunded / 500n;
  check(integer(l.reversalTargetUnits) === target &&
    integer(l.reversedUnits) + integer(l.reversalShortfallUnits) === target,
    'REFUND_REVERSAL_TARGET_MISMATCH');
  if(refunded>0n) {
    check(!!w?.riskFrozenAt && riskEvents.some(x=>x.kind==='refund' && x.paymentIntentId===p.id &&
      integer(x.refundedAmountUsdMinor)===refunded), 'REFUND_RISK_NOT_RECONCILED');
    check(reversalSnapshots.some(x=>integer(x.refundedAmountUsdMinor)===refunded &&
      integer(x.chargedAmountUsdMinor)===500n && integer(x.targetUnits)===target),
      'REFUND_SNAPSHOT_MISSING');
  }
  if(stage==='funded' || stage==='replay') {
    check(refunded===0n && c.disputed===false && riskEvents.length===0,
      'PAYMENT_NO_LONGER_UNDISPUTED');
  } else if(stage==='refund') {
    check(refunded>0n, 'STRIPE_REFUND_NOT_PRESENT');
  } else if(stage==='dispute') {
    check(!!w?.riskFrozenAt && riskEvents.some(x=>x.kind==='dispute' && x.paymentIntentId===p.id),
      'STRIPE_DISPUTE_NOT_RECONCILED');
  }
  const financialState = {
    lot:[l.sourceKey, ...['grantedUnits','availableUnits','reservedUnits','consumedUnits','expiredUnits','reversedUnits','reversalTargetUnits','reversalShortfallUnits'].map(k=>String(l[k]))],
    entries:[...entries].sort((a,b)=>a.eventKey.localeCompare(b.eventKey)).map(x=>[x.eventKey,x.kind,...['availableDelta','reservedDelta','consumedDelta','expiredDelta','reversedDelta'].map(k=>String(x[k]))]),
    risk:[...riskEvents].sort((a,b)=>a.eventKey.localeCompare(b.eventKey)).map(x=>[x.eventKey,x.kind,String(x.refundedAmountUsdMinor)]),
    snapshots:[...reversalSnapshots].sort((a,b)=>Number(a.refundedAmountUsdMinor-b.refundedAmountUsdMinor)).map(x=>[String(x.refundedAmountUsdMinor),String(x.targetUnits),String(x.appliedUnits),String(x.shortfallUnits)]),
    frozen:!!w?.riskFrozenAt,
  };
  const fingerprint = createHash('sha256').update(stable(financialState)).digest('hex');
  if(stage==='replay') {
    check(typeof expectedFingerprint === 'string' && /^[a-f0-9]{64}$/.test(expectedFingerprint),
      'REPLAY_BASELINE_REQUIRED');
    check(fingerprint===expectedFingerprint, 'REPLAY_FINANCIAL_STATE_CHANGED');
    check(!!eventId, 'REPLAY_ORIGINAL_EVENT_ID_REQUIRED');
  }
  return {stage, fingerprint, refundedMinor:String(refunded), reversedUnits:String(l.reversedUnits),
    reversalShortfallUnits:String(l.reversalShortfallUnits), grantEntries:1, webhookEvidenceCount:webhooks.length};
}
