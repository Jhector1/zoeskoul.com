"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {formatBuilderBillingAmount} from "./formatBuilderBillingAmount";
import {customCreditAmount,getOrCreateCustomCreditCheckoutAttempt,inspectPendingCustomCreditCheckout,
  readAnyCheckoutRecoveryIdentity,releaseVerifiedAnyCheckoutIdentity,
  trustedStripeCheckoutUrl,type AnyCheckoutRecoveryIdentity} from "./customAiCreditTopUpPolicy";

type EntryUnit="usd"|"credits";
type RecoveryDisplay =
  | Readonly<{kind:"checking"}>
  | Readonly<{kind:"buy"}>
  | Readonly<{kind:"finish";amountUsdMinor:number|null}>
  | Readonly<{kind:"settling"}>
  | Readonly<{kind:"problem"}>;

function sameIdentity(a:AnyCheckoutRecoveryIdentity,b:AnyCheckoutRecoveryIdentity|null):boolean {
  return b!==null&&a.id===b.id&&a.purchaseKind===b.purchaseKind&&
    (a.purchaseKind==="custom"&&b.purchaseKind==="custom"?a.amountUsdMinor===b.amountUsdMinor:
      a.purchaseKind==="fixed"&&b.purchaseKind==="fixed"&&a.priceId===b.priceId);
}

async function recoveryRequest(action:"status"|"release"|"cancel",identity:AnyCheckoutRecoveryIdentity){
  const response=await fetch("/api/billing/credit-packs/recovery",{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(identity.purchaseKind==="custom"?{action,purchaseKind:"custom",
      checkoutAttemptId:identity.id,amountUsdMinor:identity.amountUsdMinor}:
      {action,purchaseKind:"fixed",checkoutAttemptId:identity.id,priceId:identity.priceId}),
    signal:AbortSignal.timeout(25000),
  });
  const payload:unknown=await response.json();
  if(!payload||typeof payload!=="object"||Array.isArray(payload)||!response.ok)
    throw Error("CHECK_UNAVAILABLE");
  return payload as Record<string,unknown>;
}


/** Payment recovery is automatic. The browser never infers payment status or grants credits. */
export default function CustomAiCreditTopUp({locale,enabled,onCheckoutReconciled}:{
  locale:string;enabled:boolean;onCheckoutReconciled?:(resolution:"no-pending"|"verified")=>void;
}){
  const [unit,setUnit]=useState<EntryUnit>("usd");
  const [entry,setEntry]=useState("10");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [recovery,setRecovery]=useState<RecoveryDisplay>({kind:"checking"});
  const [settlementChecks,setSettlementChecks]=useState(0);
  const inFlight=useRef(false);
  const alive=useRef(true);
  const onReconciledRef=useRef(onCheckoutReconciled);
  useEffect(()=>{onReconciledRef.current=onCheckoutReconciled;},[onCheckoutReconciled]);
  const calculation=useMemo(()=>{try{return {value:customCreditAmount(entry,unit),error:""};}
    catch(e){return {value:null,error:e instanceof Error?e.message:"Invalid amount."};}},[entry,unit]);
  const quote=calculation.value;


  const reconcile=useCallback(async (intent:"check"|"finish"="check",quiet=false)=>{
    if(inFlight.current)return;
    const pending=inspectPendingCustomCreditCheckout({storage:sessionStorage,now:Date.now()});
    if(pending.kind==="none"){
      // No unfinished browser checkout exists. Clear only a stale cancel
      // banner; the parent retains unverified success-return messaging.
      if(alive.current){setRecovery({kind:"buy"});onReconciledRef.current?.("no-pending");}
      return;
    }
    const identity=readAnyCheckoutRecoveryIdentity(sessionStorage);
    if(!identity){if(alive.current)setRecovery({kind:"problem"});return;}
    inFlight.current=true;
    if(alive.current){setBusy(true);setError("");if(!quiet)setRecovery({kind:"checking"});}
    try {
      const result=await recoveryRequest("status",identity);
      if(!sameIdentity(identity,readAnyCheckoutRecoveryIdentity(sessionStorage)))
        throw Error("CHECKOUT_CHANGED");
      if(result.state==="open"){
        const url=trustedStripeCheckoutUrl(result.url);
        if(!url)throw Error("CHECK_UNAVAILABLE");
        if(alive.current)onReconciledRef.current?.("verified");
        if(intent==="finish"){
          // Fresh Stripe verification is required at the moment of navigation.
          window.location.assign(url);
          return;
        }
        if(alive.current)setRecovery({kind:"finish",amountUsdMinor:identity.purchaseKind==="custom"?
          identity.amountUsdMinor:null});
      }else if(result.state==="expired_unpaid"||result.state==="funded"){
        // Recheck against Stripe and the canonical ledger on the server before retiring
        // the exact browser key. Never remove on a mere success redirect.
        const released=await recoveryRequest("release",identity);
        if(released.released!==true ||
          !releaseVerifiedAnyCheckoutIdentity(sessionStorage,identity))throw Error("CHECK_UNAVAILABLE");
        if(alive.current){
          setRecovery({kind:"buy"});setSettlementChecks(0);
          onReconciledRef.current?.("verified");
          if(result.state==="funded"){
            setNotice("Payment complete. Your credits have been added.");
          }else setNotice("Your previous payment has ended. You can choose a new amount.");
        }
      }else if(result.state==="completed"){
        if(alive.current){
          onReconciledRef.current?.("verified");
          setRecovery({kind:"settling"});
        }
      }else {
        if(alive.current)setRecovery({kind:"problem"});
      }
    }catch{
      if(alive.current)setRecovery({kind:"problem"});
    }finally{
      inFlight.current=false;
      if(alive.current)setBusy(false);
    }
  },[]);

  useEffect(()=>{
    alive.current=true;
    void reconcile();
    const onFocus=()=>{if(document.visibilityState==="visible")void reconcile("check",true);};
    window.addEventListener("focus",onFocus);
    return ()=>{alive.current=false;window.removeEventListener("focus",onFocus);};
  },[reconcile]);
  // A paid Checkout session may precede its signed webhook. Allow a short,
  // bounded automatic reconciliation period; never authorize a new purchase meanwhile.
  useEffect(()=>{
    if(recovery.kind!=="settling"||settlementChecks>=6)return;
    const timer=window.setTimeout(()=>{
      setSettlementChecks(count=>count+1);
      void reconcile("check",true);
    },5000);
    return ()=>window.clearTimeout(timer);
  },[recovery.kind,settlementChecks,reconcile]);

  async function abandonCheckout(reason:"change"|"cancel"){
    if(inFlight.current || recovery.kind!=="finish")return;
    const identity=readAnyCheckoutRecoveryIdentity(sessionStorage);
    if(!identity){setRecovery({kind:"problem"});return;}
    inFlight.current=true;setBusy(true);setError("");
    try{
      // Only the Web billing authority may expire the fully verified Stripe
      // TEST session. A Stripe payment race MUST NOT be treated as cancellation.
      const outcome=await recoveryRequest("cancel",identity);
      if(outcome.safeToRelease!==true ||
         !sameIdentity(identity,readAnyCheckoutRecoveryIdentity(sessionStorage)))
        throw Error("CHECKOUT_CHANGED");
      // Recheck the original attempt after the Stripe mutation before touching
      // the browser key. A completed-but-unfunded session is never released.
      const verified=await recoveryRequest("release",identity);
      if(verified.released!==true ||
         !releaseVerifiedAnyCheckoutIdentity(sessionStorage,identity))
        throw Error("CHECKOUT_UNVERIFIED");
      if(alive.current){
        setRecovery({kind:"buy"});setSettlementChecks(0);
        onReconciledRef.current?.("verified");
        if(outcome.wasFunded===true){
          setNotice("Payment complete. Your credits have been added.");
        }else setNotice(reason==="change"?"Choose a new amount for your credits.":
          "Your unfinished payment was canceled. No new charge was made.");
      }
    }catch{
      if(alive.current){setRecovery({kind:"problem"});
        setError("We couldn't safely cancel that payment. Please try again.");}
    }finally{inFlight.current=false;if(alive.current)setBusy(false);}
  }
  function changeUnit(next:EntryUnit){
    if(next===unit)return;
    if(quote)setEntry(next==="usd"?(quote.amountUsdMinor/100).toFixed(2):String(quote.customerCredits));
    else setEntry(next==="usd"?"10":"1000");
    setUnit(next);setError("");
  }
  async function buy(){
    if(!enabled||inFlight.current||!quote||recovery.kind!=="buy")return;
    const pending=inspectPendingCustomCreditCheckout({storage:sessionStorage,now:Date.now()});
    if(pending.kind!=="none"){
      void reconcile();return;
    }
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    let needsRecovery=false;
    let redirecting=false;
    try {
      const checkoutAttemptId=getOrCreateCustomCreditCheckoutAttempt({storage:sessionStorage,
        amountUsdMinor:quote.amountUsdMinor,now:Date.now(),createUuid:()=>crypto.randomUUID()});
      needsRecovery=true;
      const response=await fetch("/api/billing/credit-packs/checkout",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({purchaseKind:"custom",amountUsdMinor:quote.amountUsdMinor,checkoutAttemptId}),
        signal:AbortSignal.timeout(25000),
      });
      const result:unknown=await response.json();
      const url=result&&typeof result==="object"&&!Array.isArray(result)&&
        "url" in result?trustedStripeCheckoutUrl(result.url):null;
      if(!response.ok||!url)throw Error("CHECKOUT_UNAVAILABLE");
      window.location.assign(url);
      redirecting=true;
    }catch{
      setError("We couldn't open your payment. Please try again.");
    }finally{
      inFlight.current=false;setBusy(false);
      // A request may have created a Stripe session before the connection failed.
      // Reconcile the retained attempt rather than starting another payment.
      if(needsRecovery&&!redirecting)void reconcile();
    }
  }
  const buying=recovery.kind==="buy";
  const primaryLabel=recovery.kind==="finish"?
    `Finish your payment${recovery.amountUsdMinor!==null?` · ${formatBuilderBillingAmount(locale,"USD",recovery.amountUsdMinor)}`:""}`:
    recovery.kind==="checking"?"Checking your payment…":
    recovery.kind==="settling"?"Adding your credits…":
    recovery.kind==="problem"?"Try again":
    quote?`Buy credits · ${formatBuilderBillingAmount(locale,"USD",quote.amountUsdMinor)}`:"Buy credits";
  const buttonDisabled=busy||!enabled||recovery.kind==="checking"||recovery.kind==="settling"||
    (buying&&!quote);
  function primaryAction(){
    if(recovery.kind==="finish")void reconcile("finish");
    else if(recovery.kind==="problem")void reconcile();
    else if(buying)void buy();
  }
  return <div className="min-w-0 space-y-4 rounded-xl border border-current/15 p-4 sm:p-5" aria-label="Buy AI credits">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-base font-semibold">{buying?"Choose your amount":"Your credit purchase"}</h4>
      <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[11px] font-medium">One-time payment</span>
    </div>
    {buying&&<>
      <div className="grid grid-cols-4 gap-2" aria-label="Suggested credit amounts">
        {[5,10,20,50].map(dollars=><button type="button" key={dollars} disabled={busy}
          aria-pressed={quote?.amountUsdMinor===dollars*100}
          onClick={()=>{setUnit("usd");setEntry(String(dollars));setError("");}}
          className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${quote?.amountUsdMinor===dollars*100?"border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950":"border-current/15 hover:border-current/50"}`}>
          ${dollars}
        </button>)}
      </div>
      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-xs font-semibold uppercase tracking-wider opacity-65">Or enter a custom amount</legend>
        <div className="inline-flex gap-1 rounded-xl bg-slate-500/10 p-1 text-sm" aria-label="Choose dollar or credit entry">
          <label className={`cursor-pointer rounded-lg px-3 py-2 font-medium ${unit==="usd"?"bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white":"opacity-75"}`}>
            <input type="radio" name="custom-topup-unit" checked={unit==="usd"} onChange={()=>changeUnit("usd")} className="sr-only"/> Dollars
          </label>
          <label className={`cursor-pointer rounded-lg px-3 py-2 font-medium ${unit==="credits"?"bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white":"opacity-75"}`}>
            <input type="radio" name="custom-topup-unit" checked={unit==="credits"} onChange={()=>changeUnit("credits")} className="sr-only"/> Credits
          </label>
        </div>
        <label className="block text-sm font-medium" htmlFor="zoebuild-custom-topup-value">{unit==="usd"?"Amount (USD)":"Credits"}</label>
        <div className="relative">
          {unit==="usd"&&<span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold opacity-60">$</span>}
          <input id="zoebuild-custom-topup-value" inputMode={unit==="usd"?"decimal":"numeric"} autoComplete="off" value={entry}
            onChange={event=>{setEntry(event.target.value);setError("");}}
            aria-invalid={!quote} aria-describedby="zoebuild-custom-topup-help"
            className={`min-h-12 w-full rounded-xl border border-current/20 bg-transparent py-3 pr-4 text-lg font-semibold tabular-nums outline-none focus:border-current/60 focus:ring-2 focus:ring-current/10 ${unit==="usd"?"pl-9":"pl-4"}`}
            placeholder={unit==="usd"?"17.25":"1725"}/>
        </div>
        <p id="zoebuild-custom-topup-help" className="text-xs opacity-65">$5 minimum · $500 maximum · 100 credits per $1</p>
      </fieldset>
      {!quote&&<p role="status" className="text-sm text-amber-700 dark:text-amber-300">{calculation.error}</p>}
      {quote&&<div className="rounded-xl bg-slate-500/10 p-4" aria-live="polite">
        <p className="text-xs font-medium opacity-65">You'll receive</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-2xl font-bold tabular-nums">{quote.customerCredits.toLocaleString(locale)} <span className="text-sm font-medium opacity-70">credits</span></p>
          <p className="text-lg font-semibold tabular-nums">{formatBuilderBillingAmount(locale,"USD",quote.amountUsdMinor)}</p>
        </div>
      </div>}
    </>}
    {recovery.kind==="finish"&&<p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      You have an unfinished payment{recovery.amountUsdMinor!==null?` for ${formatBuilderBillingAmount(locale,"USD",recovery.amountUsdMinor)}`:""}.
      You can finish it, change your amount, or cancel. No new charge has been made.
    </p>}
    {recovery.kind==="finish"&&<div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy} onClick={()=>void abandonCheckout("change")}
        className="min-h-10 rounded-lg border border-current/25 px-4 py-2 text-sm font-semibold disabled:opacity-50">
        Change amount
      </button>
      <button type="button" disabled={busy} onClick={()=>void abandonCheckout("cancel")}
        className="min-h-10 px-3 py-2 text-sm underline underline-offset-4 opacity-75 hover:opacity-100 disabled:opacity-50">
        Cancel checkout
      </button>
    </div>}
    {recovery.kind==="checking"&&<p role="status" className="text-sm opacity-75">Checking your previous payment…</p>}
    {recovery.kind==="settling"&&<p role="status" className="rounded-xl border border-current/15 p-4 text-sm">
      Your payment is being confirmed. We'll add your credits once it's complete. You can return to this page later.
    </p>}
    {recovery.kind==="problem"&&<p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      We couldn't confirm your earlier payment. Please try again. If this continues, contact support before making another payment.
    </p>}
    {notice&&buying&&<p role="status" className="rounded-xl border border-current/15 p-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm">{error}</p>}
    <button type="button" onClick={primaryAction} disabled={buttonDisabled}
      className="min-h-12 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
      {busy?"Checking…":primaryLabel}
    </button>
    {!enabled&&<p role="status" className="text-xs leading-5 opacity-70">Credit purchases aren't available right now.</p>}
    <p className="text-xs leading-5 opacity-65">One-time payment. No subscription or automatic renewal.</p>
  </div>;
}
