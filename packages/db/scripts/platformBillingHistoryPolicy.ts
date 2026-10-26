/** Pure, offline source audit for a historical paid Builder Checkout. No provider/DB access. */
export type HistorySubscription = Readonly<{
  stripeSubscriptionId:string;
  stripeCustomerId:string;
  priceId:string|null;
  billingProduct:string|null;
  status:string;
  currentPeriodEnd:Date|null;
  trialEnd:Date|null;
}>;
export type PriceClass = 'builder'|'learning'|'unmapped'|'absent'|'collision';
export type HistorySummary=Readonly<{
  priceCatalogCollision:boolean;
  historicalPriceClass:PriceClass;
  historicalProduct:string;
  historicalEligible:boolean;
  ownerMatched:boolean;
  currentBuilderCount:number;
  currentBuilderIsHistorical:boolean;
  otherCurrentBuilderCount:number;
  otherCurrentBuilderWithDifferentPeriod:boolean;
  currentBuilderMissingProductCount:number;
  currentBuilderConflictingProductCount:number;
  storedProductWarning:boolean;
  historyRequiresReview:boolean;
}>;
function present(values:readonly string[]):Set<string>{return new Set(values.map(s=>s.trim()).filter(Boolean));}
function expiry(row:HistorySubscription):Date|null{
  return row.status==='trialing'?row.trialEnd:row.currentPeriodEnd;
}
export function eligible(row:HistorySubscription,now:Date):boolean {
  const end=expiry(row);
  return ['active','trialing','past_due','canceled'].includes(row.status)&&
    end instanceof Date&&Number.isFinite(end.getTime())&&end>now;
}
export function priceClass(priceId:string|null,builder:Set<string>,learning:Set<string>):PriceClass{
  if(!priceId)return 'absent';
  const b=builder.has(priceId),l=learning.has(priceId);
  return b&&l?'collision':b?'builder':l?'learning':'unmapped';
}
export function classifyHistory(input:Readonly<{
  historicalId:string;
  verifiedCustomerId:string;
  rows:readonly HistorySubscription[];
  builderPriceIds:readonly string[];
  learningPriceIds:readonly string[];
  now:Date;
}>):HistorySummary{
  const builder=present(input.builderPriceIds),learning=present(input.learningPriceIds);
  const collision=[...builder].some(p=>learning.has(p));
  const owned=input.rows.filter(r=>r.stripeCustomerId===input.verifiedCustomerId);
  const historical=input.rows.find(r=>r.stripeSubscriptionId===input.historicalId);
  const current=owned.filter(r=>priceClass(r.priceId,builder,learning)==='builder'&&eligible(r,input.now));
  const original=historical && historical.stripeCustomerId===input.verifiedCustomerId?historical:null;
  const selectedOther=current.filter(r=>r.stripeSubscriptionId!==input.historicalId);
  return {
    priceCatalogCollision:collision,
    historicalPriceClass:priceClass(original?.priceId??null,builder,learning),
    historicalProduct:original?.billingProduct??'MISSING',
    historicalEligible:Boolean(original&&eligible(original,input.now)),
    ownerMatched:Boolean(original),
    currentBuilderCount:current.length,
    currentBuilderIsHistorical:current.some(r=>r.stripeSubscriptionId===input.historicalId),
    otherCurrentBuilderCount:selectedOther.length,
    otherCurrentBuilderWithDifferentPeriod:Boolean(original&&selectedOther.some(r=>
      (r.currentPeriodEnd?.getTime()??null)!==(original.currentPeriodEnd?.getTime()??null))),
    currentBuilderMissingProductCount:current.filter(r=>!r.billingProduct).length,
    currentBuilderConflictingProductCount:current.filter(r=>r.billingProduct!==null&&r.billingProduct!=='builder_ai').length,
    storedProductWarning:!original||original.billingProduct!=='builder_ai',
    historyRequiresReview:collision || !original || priceClass(original.priceId,builder,learning)!=='builder' ||
      original.billingProduct!=='builder_ai' || selectedOther.length>0 || current.some(r=>r.billingProduct!=='builder_ai'),
  };
}
