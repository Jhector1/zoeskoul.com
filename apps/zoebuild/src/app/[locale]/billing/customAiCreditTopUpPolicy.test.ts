import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {customCreditAmount,getOrCreateCustomCreditCheckoutAttempt,inspectPendingCustomCreditCheckout,
 readCustomCheckoutRecoveryIdentity,releaseVerifiedCustomCheckoutIdentity,
 readAnyCheckoutRecoveryIdentity,releaseVerifiedAnyCheckoutIdentity,
 trustedStripeCheckoutUrl} from "./customAiCreditTopUpPolicy";
const uuid="123e4567-e89b-42d3-a456-426614174000";
const now=1770000000000;
function store(seed:string|null=null){let value=seed;return {
 getItem:(_key:string)=>value,
 setItem:(_key:string,next:string)=>{value=next;},
 current:()=>value,
};}
const request=(storage:ReturnType<typeof store>,amountUsdMinor=1725)=>({storage,amountUsdMinor,now,createUuid:()=>uuid});
describe("V12J.28D custom top-up presentation and retry safety",()=>{
 it("keeps canonical $5 and maximum $500 amount precision",()=>{
  expect(customCreditAmount("5","usd")).toEqual({amountUsdMinor:500,customerCredits:500,ledgerUnits:"500000"});
  expect(customCreditAmount("500.00","usd")).toEqual({amountUsdMinor:50000,customerCredits:50000,ledgerUnits:"50000000"});
 });
 it("supports fractional dollar purchases exactly, never binary rounding",()=>{
  expect(customCreditAmount("17.25","usd")).toEqual({amountUsdMinor:1725,customerCredits:1725,ledgerUnits:"1725000"});
  expect(customCreditAmount("5.01","usd").amountUsdMinor).toBe(501);
  expect(customCreditAmount("5.1","usd").amountUsdMinor).toBe(510);
 });
 it("accepts credit entry using the same exact price",()=>{
  for(const credits of ["500","501","1725","50000"])
   expect(customCreditAmount(credits,"credits")).toEqual(customCreditAmount((Number(credits)/100).toFixed(2),"usd"));
 });
 it("refuses invalid or ambiguous money formats",()=>{
  for(const value of [""," 5","5 ","05","5.001","5.","+5","5e2","$5","5,00","NaN","Infinity","-5","4.99","500.01","1000000"])
    expect(()=>customCreditAmount(value,"usd"),value).toThrow();
 });
 it("refuses fractional, zero, undersized and oversized credit requests",()=>{
  for(const value of ["0","499","50001","1.5","05","-500","5e2","500 ","", "1" ])
    expect(()=>customCreditAmount(value,"credits"),value).toThrow();
 });
 it("stores matching test attempt and retries with identical id",()=>{
  const storage=store();
  expect(getOrCreateCustomCreditCheckoutAttempt(request(storage))).toBe(`zb-ai-${uuid}`);
  expect(getOrCreateCustomCreditCheckoutAttempt({...request(storage),createUuid:()=>{throw Error("new attempt");}})).toBe(`zb-ai-${uuid}`);
  expect(JSON.parse(storage.current()!)).toMatchObject({purchaseKind:"custom",mode:"sandbox-only",amountUsdMinor:1725});
 });
 it("blocks identity rotation when amount differs, expires or clock regresses",()=>{
  const storage=store();getOrCreateCustomCreditCheckoutAttempt(request(storage));
  expect(()=>getOrCreateCustomCreditCheckoutAttempt(request(storage,500))).toThrow(/needs verification/);
  expect(()=>getOrCreateCustomCreditCheckoutAttempt({...request(storage),now:now+81*60*1000})).toThrow(/needs verification/);
  expect(()=>getOrCreateCustomCreditCheckoutAttempt({...request(storage),now:now-1})).toThrow(/needs verification/);
 });
 it("does not turn an outstanding fixed-price checkout into a custom checkout",()=>{
  const storage=store(JSON.stringify({mode:"sandbox-only",priceId:"price_reviewed",id:`zb-ai-${uuid}`,time:now}));
  expect(()=>getOrCreateCustomCreditCheckoutAttempt(request(storage))).toThrow(/needs verification/);
 });
 it("fails closed on damaged retry storage and invalid identity",()=>{
  expect(()=>getOrCreateCustomCreditCheckoutAttempt(request(store("{corrupt")))).toThrow(/needs verification/);
  expect(()=>getOrCreateCustomCreditCheckoutAttempt({...request(store()),createUuid:()=>"wrong"})).toThrow(/identity/);
  const storage={getItem:(_k:string)=>null,setItem:(_k:string,_v:string)=>{throw Error("disabled");}};
  expect(()=>getOrCreateCustomCreditCheckoutAttempt({...request(store()),storage})).toThrow(/storage is unavailable/);
 });
 it("UI permits only sandbox verified offers and never treats redirect as payment proof",()=>{
  const panel=readFileSync(new URL("./AiCreditPacksPanel.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("./CustomAiCreditTopUp.tsx",import.meta.url),"utf8");
  // Layout may change, but the sandbox-only catalog and the enabled prop
  // must still guard the custom Checkout UI. Assert the safety behavior,
  // rather than freezing one particular JSX rendering style.
  expect(panel).toMatch(/const\s+test\s*=\s*catalog\?\.mode\s*===\s*"sandbox-only"/);
  expect(panel).toMatch(/const\s+hasTestOffer\s*=\s*Boolean\(\s*test\s*&&\s*catalog\?\.available\s*\)/);
  expect(panel).toMatch(/\{catalog\.mode!=="live"&&<div[\s\S]*?<CustomAiCreditTopUp\s+locale=\{locale\}\s+enabled=\{Boolean\(hasTestOffer\)&&!busy\}/);
  expect(panel).not.toContain('Custom top-up pricing');
  expect(panel).not.toContain('Verified fixed-price packs');
  expect(panel.match(/<CustomAiCreditTopUp/g)?.length).toBe(1);
  // The one-button UX keeps the original safety decisions; it no longer
  // renders the previous manual verification/return-to-checkout controls.
  expect(ui).toContain('if(!enabled||inFlight.current||!quote||recovery.kind!=="buy")return;');
  expect(ui).toContain('const pending=inspectPendingCustomCreditCheckout({storage:sessionStorage,now:Date.now()});');
  expect(ui).toContain('if(pending.kind!=="none"){');
  expect(ui).toContain('void reconcile();return;');
  expect(ui).toContain('recovery.kind==="checking"||recovery.kind==="settling"');
  expect(ui).toContain('if(recovery.kind==="finish")void reconcile("finish");');
  expect(ui).toContain('const result=await recoveryRequest("status",identity);');
  expect(ui).toContain('!sameIdentity(identity,readAnyCheckoutRecoveryIdentity(sessionStorage))');
  expect(ui).toContain('const released=await recoveryRequest("release",identity);');
  expect(ui).toContain('releaseVerifiedAnyCheckoutIdentity(sessionStorage,identity)');
  expect(ui).toContain('purchaseKind:"custom"');
  expect(ui).toContain('amountUsdMinor:quote.amountUsdMinor');
  expect(ui).not.toContain('creditUnits:quote.ledgerUnits');
  expect(ui).toContain("trustedStripeCheckoutUrl");
  expect(ui).not.toContain('Verify previous Stripe checkout');
  expect(ui).not.toContain('Release expired unpaid checkout');
  // The Stripe success URL is pending information, NOT purchase confirmation.
  expect(panel).toContain('Your payment is being confirmed. Your credits will appear here once it is complete.');
  expect(panel).toContain('We check payment status and add credits automatically.');
  expect(ui).toContain('if(result.state==="funded")');
  expect(ui).toContain('Payment complete. Your credits have been added.');
 });
 it("removes stale Stripe return notice only after verified checkout state or safe cancellation",()=>{
  const panel=readFileSync(new URL("./AiCreditPacksPanel.tsx",import.meta.url),"utf8");
  const ui=readFileSync(new URL("./CustomAiCreditTopUp.tsx",import.meta.url),"utf8");
  expect(panel).toContain('onCheckoutReconciled={onCheckoutReconciled}');
  expect(panel).toContain('if(resolution==="no-pending"&&marker==="success")return;');
  expect(ui).toContain('if(pending.kind==="none"){');
  expect(ui).toContain('onReconciledRef.current?.("no-pending");');
  expect(ui).toContain('onReconciledRef.current?.("verified");');
  expect(panel).toContain('setNotice("");');
  expect(panel).toContain('if(marker==="success"||marker==="cancelled")');
  expect(panel).toContain('current.searchParams.delete("credits")');
  expect(panel).toContain('window.history.replaceState(window.history.state,"",current.pathname+current.search+current.hash)');
  // Reconciliation callbacks are now state-specific: no-pending must not
  // claim a successful Stripe payment; verified follows server approval.
  expect(ui).toContain('onReconciledRef.current?.("no-pending");');
  expect(ui).toContain('onReconciledRef.current?.("verified");');
  expect(ui).not.toContain('onReconciledRef.current?.();');
  expect(ui).toContain('const released=await recoveryRequest("release",identity);');
  expect(ui).toContain('const verified=await recoveryRequest("release",identity);');
  // A failed or unresolved request must NOT retire the local retry key or
  // remove the return marker as if cancellation were confirmed.
  expect(ui).toContain('if(verified.released!==true ||');
  expect(ui).toContain('!releaseVerifiedAnyCheckoutIdentity(sessionStorage,identity)');
  expect(ui).not.toContain('onVerifiedPurchase');
 });
 it("shows recoverable same-amount custom checkout but does not mutate storage",()=>{
  const storage=store();getOrCreateCustomCreditCheckoutAttempt(request(storage,1000));
  const prior=storage.current();
  expect(inspectPendingCustomCreditCheckout({storage,now})).toEqual({kind:"resumable",amountUsdMinor:1000});
  expect(storage.current()).toBe(prior);
  // The only safe browser-side replay is the exact original amount and ID.
  expect(getOrCreateCustomCreditCheckoutAttempt(request(storage,1000))).toBe(`zb-ai-${uuid}`);
  expect(()=>getOrCreateCustomCreditCheckoutAttempt(request(storage,725))).toThrow(/needs verification/);
 });
 it("shows no pending identity only when none exists, without writing",()=>{
  const storage=store();
  expect(inspectPendingCustomCreditCheckout({storage,now})).toEqual({kind:"none"});
  expect(storage.current()).toBe(null);
 });
 it("never labels expired, future, malformed or another mode as resumable",()=>{
  const valid={purchaseKind:"custom",mode:"sandbox-only",amountUsdMinor:1000,id:`zb-ai-${uuid}`,time:now};
  for(const value of ["{bad",JSON.stringify({...valid,mode:"live"}),
    JSON.stringify({...valid,amountUsdMinor:725.5}),
    JSON.stringify({...valid,id:"bad"}),
    JSON.stringify({...valid,time:now+1}),
    JSON.stringify({...valid,time:now-80*60*1000}),
    JSON.stringify({mode:"sandbox-only",priceId:"price_123",id:`zb-ai-${uuid}`,time:now})]){
    const storage=store(value);
    expect(inspectPendingCustomCreditCheckout({storage,now})).toEqual({kind:"requires-verification"});
    expect(storage.current()).toBe(value);
  }
 });
 it("fails closed when pending storage cannot be inspected",()=>{
  const storage={getItem:(_k:string):string|null=>{throw Error("denied");}};
  expect(inspectPendingCustomCreditCheckout({storage,now})).toEqual({kind:"requires-verification"});
  expect(inspectPendingCustomCreditCheckout({storage:store(),now:-1})).toEqual({kind:"requires-verification"});
 });
 it("keeps expired custom identity available only for server-backed verification",()=>{
  const storage=store();getOrCreateCustomCreditCheckoutAttempt(request(storage));
  expect(inspectPendingCustomCreditCheckout({storage,now:now+81*60*1000})).toEqual({kind:"requires-verification"});
  expect(readCustomCheckoutRecoveryIdentity(storage)).toEqual({id:`zb-ai-${uuid}`,amountUsdMinor:1725});
 });
 it("releases only the exact server-verified browser identity",()=>{
  const storage=store();getOrCreateCustomCreditCheckoutAttempt(request(storage));
  const verified={id:`zb-ai-${uuid}`,amountUsdMinor:1725};
  expect(releaseVerifiedCustomCheckoutIdentity({...storage,removeItem:()=>{throw Error("blocked");}},verified)).toBe(false);
  expect(storage.current()).not.toBeNull();
  expect(releaseVerifiedCustomCheckoutIdentity({...storage,removeItem:()=>{}},{...verified,amountUsdMinor:900})).toBe(false);
  expect(storage.current()).not.toBeNull();
  let value=storage.current();
  const removable={getItem:(_key:string)=>value,removeItem:(_key:string)=>{value=null;}};
  expect(releaseVerifiedCustomCheckoutIdentity(removable,verified)).toBe(true);
  expect(value).toBeNull();
 });
 it("never recovers fixed-price attempts or damaged identity",()=>{
  expect(readCustomCheckoutRecoveryIdentity(store("{broken"))).toBeNull();
  expect(readCustomCheckoutRecoveryIdentity(store(JSON.stringify({mode:"sandbox-only",id:`zb-ai-${uuid}`,
   priceId:"price_foo",time:now})))).toBeNull();
 });
 it("recovers historical sandbox fixed-price identity only with strict shape",()=>{
  const legacy=JSON.stringify({priceId:"price_old123",id:`zb-ai-${uuid}`,time:now});
  expect(readAnyCheckoutRecoveryIdentity(store(legacy))).toEqual({purchaseKind:"fixed",id:`zb-ai-${uuid}`,priceId:"price_old123"});
  const withMode=JSON.stringify({mode:"sandbox-only",priceId:"price_old123",id:`zb-ai-${uuid}`,time:now});
  expect(readAnyCheckoutRecoveryIdentity(store(withMode))).toEqual({purchaseKind:"fixed",id:`zb-ai-${uuid}`,priceId:"price_old123"});
  for(const item of [{mode:"live"},{priceId:"oops"},{purchaseKind:"custom"},{time:-1},{amountUsdMinor:500}]){
    const value=JSON.stringify({mode:"sandbox-only",priceId:"price_old123",id:`zb-ai-${uuid}`,time:now,...item});
    expect(readAnyCheckoutRecoveryIdentity(store(value))).toBeNull();
  }
 });
 it("releases only a matching fixed browser key after verified server release",()=>{
  let value=JSON.stringify({mode:"sandbox-only",priceId:"price_old123",id:`zb-ai-${uuid}`,time:now});
  const storage={getItem:(_k:string)=>value,removeItem:(_k:string)=>{value="";}};
  expect(releaseVerifiedAnyCheckoutIdentity(storage,{purchaseKind:"fixed",id:`zb-ai-${uuid}`,priceId:"price_other"})).toBe(false);
  expect(value).not.toBe("");
  expect(releaseVerifiedAnyCheckoutIdentity(storage,{purchaseKind:"fixed",id:`zb-ai-${uuid}`,priceId:"price_old123"})).toBe(false);
  // A browser implementation must actually remove the key, not store an empty string.
  value=JSON.stringify({mode:"sandbox-only",priceId:"price_old123",id:`zb-ai-${uuid}`,time:now});
  const correct={getItem:(_k:string)=>value,removeItem:(_k:string)=>{value=null as unknown as string;}};
  expect(releaseVerifiedAnyCheckoutIdentity(correct,{purchaseKind:"fixed",id:`zb-ai-${uuid}`,priceId:"price_old123"})).toBe(true);
 });
 it("preserves valid Stripe Checkout URL fragments without weakening host validation",()=>{
   const stripeUrl="https://checkout.stripe.com/c/pay/cs_test_example#fidkdWx-opaque";
   expect(trustedStripeCheckoutUrl(stripeUrl)).toBe(stripeUrl);
   expect(trustedStripeCheckoutUrl("https://checkout.stripe.com.attacker.example/c/pay/cs_test_example#fidkdWx")).toBeNull();
   expect(trustedStripeCheckoutUrl("https://user:pass@checkout.stripe.com/c/pay/cs_test_example#fidkdWx")).toBeNull();
   expect(trustedStripeCheckoutUrl("http://checkout.stripe.com/c/pay/cs_test_example#fidkdWx")).toBeNull();
   expect(trustedStripeCheckoutUrl(null)).toBeNull();
 });
 it("automatic recovery hides technical steps and keeps one primary checkout action",()=>{
  const ui=readFileSync(new URL("./CustomAiCreditTopUp.tsx",import.meta.url),"utf8");
  expect(ui).toContain('Finish your payment');
  expect(ui).toContain('Buy credits');
  expect(ui).toContain('const reconcile=useCallback');
  expect(ui).toContain('void reconcile();');
  expect(ui).toContain('reconcile("finish")');
  expect(ui).toContain('recoveryRequest("release",identity)');
  expect(ui).toContain('releaseVerifiedAnyCheckoutIdentity(sessionStorage,identity)');
  expect(ui).toContain('result.state==="funded"');
  expect(ui).toContain('result.state==="expired_unpaid"');
  expect(ui).toContain('result.state==="completed"');
  expect(ui).toContain('window.location.assign(url)');
  expect(ui).toContain('!sameIdentity(identity,readAnyCheckoutRecoveryIdentity(sessionStorage))');
  expect(ui.match(/<button\b/g)??[]).toHaveLength(4); // Presets, primary CTA, change and cancel.
  expect(ui).toContain('onClick={()=>void abandonCheckout("change")}');
  expect(ui).toContain('onClick={()=>void abandonCheckout("cancel")}');
  expect(ui).toContain('const outcome=await recoveryRequest("cancel",identity);');
  expect(ui).toContain('const verified=await recoveryRequest("release",identity);');
  expect(ui).toContain('if(outcome.wasFunded===true)');
  expect(ui).toContain('recovery.kind==="finish"&&<div');
  expect(ui).not.toContain('Verify previous Stripe checkout');
  expect(ui).not.toContain('Release expired unpaid checkout');
  expect(ui).not.toContain('Resume verified Stripe checkout');
  expect(ui).not.toContain('sessionStorage.removeItem(');
  expect(ui).not.toContain('sessionStorage.clear(');
 });
});
