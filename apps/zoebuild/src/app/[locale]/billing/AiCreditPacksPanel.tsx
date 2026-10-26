"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {formatBuilderBillingAmount} from "./formatBuilderBillingAmount";
import {formatPackCreditValue} from "./customerCreditDisplay";
import CustomAiCreditTopUp from "./CustomAiCreditTopUp";
import {
  creditCatalogAvailabilityMessage,getOrCreateCreditCheckoutAttempt,parseAiCreditCatalog,
  type AiCreditCatalog,type AiCreditPack,
} from "./aiCreditPurchasePolicy";

export default function AiCreditPacksPanel({locale}:{locale:string}){
  const [catalog,setCatalog]=useState<AiCreditCatalog|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [liveAcknowledged,setLiveAcknowledged]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const inFlight=useRef(false);
  // Clear the Stripe return message only after the child has verified the
  // checkout state with the authenticated billing authority. Keep other query
  // parameters and the Next.js history state intact.
  const onCheckoutReconciled=useCallback((resolution:"no-pending"|"verified")=>{
    const current=new URL(window.location.href);
    const marker=current.searchParams.get("credits");
    // With no local checkout identity we can retire an obsolete CANCEL return
    // notice, but we cannot infer that a SUCCESS redirect was fulfilled.
    if(resolution==="no-pending"&&marker==="success")return;
    setNotice("");
    if(marker==="success"||marker==="cancelled"){
      current.searchParams.delete("credits");
      window.history.replaceState(window.history.state,"",current.pathname+current.search+current.hash);
    }
  },[]);
  const loadCatalog=useCallback(async()=>{
    setLoading(true);setCatalog(null);setError("");setLiveAcknowledged(false);
    try{
      const response=await fetch("/api/billing/credit-packs",{credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw Error(response.status===401?"Your session expired. Sign in again to check credit purchases.":"Credit-pack catalog unavailable.");
      setCatalog(parseAiCreditCatalog(await response.json() as unknown));
    }catch(cause){setCatalog(null);setError(cause instanceof Error?cause.message:"Credit-pack catalog unavailable.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    const query=new URLSearchParams(window.location.search);
    if(query.get("credits")==="success")setNotice("Your payment is being confirmed. Your credits will appear here once it is complete.");
    if(query.get("credits")==="cancelled")setNotice("You left checkout. We’ll check if that payment is still open so you can finish it safely.");
    void loadCatalog();
    const refreshOnFocus=()=>{if(document.visibilityState==="visible"&&!inFlight.current)void loadCatalog();};
    window.addEventListener("focus",refreshOnFocus);
    return ()=>window.removeEventListener("focus",refreshOnFocus);
  },[loadCatalog]);
  async function purchase(pack:AiCreditPack){
    if(inFlight.current||!catalog?.available||catalog.mode==="off"||
      !catalog.packs.some(p=>p.priceId===pack.priceId))return;
    if(catalog.mode==="live"&&!liveAcknowledged){setError("Acknowledge the real payment before continuing.");return;}
    inFlight.current=true;setBusy(true);setError("");
    try{
      const id=getOrCreateCreditCheckoutAttempt({storage:sessionStorage,mode:catalog.mode,
        priceId:pack.priceId,now:Date.now(),createUuid:()=>crypto.randomUUID()});
      const response=await fetch("/api/billing/credit-packs/checkout",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({priceId:pack.priceId,checkoutAttemptId:id}),signal:AbortSignal.timeout(25000),
      });
      const data=await response.json() as {url?:string;code?:string};
      if(!response.ok||!data.url)throw Error(data.code??"Credit-pack checkout unavailable.");
      const target=new URL(data.url);
      if(target.protocol!=="https:"||target.hostname!=="checkout.stripe.com"||target.username||target.password)
        throw Error("Untrusted Stripe checkout URL.");
      window.location.assign(target.href);
    }catch(cause){setError(cause instanceof Error?cause.message:"Credit-pack checkout unavailable.");}
    finally{inFlight.current=false;setBusy(false);}
  }
  const live=catalog?.mode==="live";
  const test=catalog?.mode==="sandbox-only";
  const hasTestOffer=Boolean(test&&catalog?.available);
  return <section aria-labelledby="zoebuild-credit-buy-heading" className="ui-page-surface min-w-0 rounded-2xl border border-current/10 p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest opacity-60">One-time top-up</p>
        <h3 id="zoebuild-credit-buy-heading" className="mt-1 text-xl font-bold sm:text-2xl">Buy AI credits</h3>
        <p className="mt-1 text-sm opacity-70">100 credits per $1 · One-time payment · No renewal</p>
      </div>
    </div>

    {notice&&<p role="status" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{notice}</p>}
    {error&&<div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">
      <span>{error}</span>
      <button type="button" disabled={loading||busy} onClick={()=>void loadCatalog()}
        className="min-h-10 rounded-lg border border-current/20 px-3 py-2 text-sm font-semibold disabled:opacity-50">Try again</button>
    </div>}
    {loading&&<p role="status" className="mt-5 text-sm opacity-70">Loading credit options…</p>}

    {!loading&&catalog&&<>
      {test&&<div role="status" className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500"/>Stripe test mode · No real charge
      </div>}
      {live&&<p role="status" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-semibold">Stripe live mode · A confirmed purchase initiates a real charge.</p>}
      {!catalog.available&&<p role="status" className="mt-4 rounded-xl border border-current/10 bg-slate-500/5 p-3 text-sm opacity-75">{creditCatalogAvailabilityMessage(catalog.mode)}</p>}

      {catalog.mode!=="live"&&<div className="mx-auto mt-5 w-full max-w-3xl">
        <CustomAiCreditTopUp locale={locale} enabled={Boolean(hasTestOffer)&&!busy}
          onCheckoutReconciled={onCheckoutReconciled}/>
      </div>}

      {live&&catalog.available&&<div className="mt-5 space-y-4">
        <label className="flex items-start gap-2 rounded-xl border border-amber-500/30 p-3 text-sm">
          <input type="checkbox" checked={liveAcknowledged} disabled={busy} onChange={event=>setLiveAcknowledged(event.target.checked)} className="mt-1"/>
          <span>I understand this is a real one-time payment, separate from my subscription.</span>
        </label>
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">{catalog.packs.map(pack=><article key={pack.priceId} className="rounded-xl border border-current/15 p-4">
          <p className="text-2xl font-bold tabular-nums">{formatBuilderBillingAmount(locale,"USD",pack.amountUsdMinor)}</p>
          <p className="mt-1 text-sm opacity-75">{formatPackCreditValue(pack.creditUnits,locale)}</p>
          <button type="button" disabled={busy||!liveAcknowledged} onClick={()=>void purchase(pack)} className="mt-4 min-h-11 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">
            {busy?"Opening Stripe…":"Buy · Real payment"}</button>
        </article>)}</div>
      </div>}
    </>}

    <details className="mt-5 border-t border-current/10 pt-3 text-xs leading-5 opacity-70">
      <summary className="cursor-pointer font-medium">How do credit purchases work?</summary>
      <p className="mt-2">Credit purchases are one-time payments. We check payment status and add credits automatically. If you have a payment in progress, you can finish it safely before starting another.</p>
    </details>
  </section>;
}
