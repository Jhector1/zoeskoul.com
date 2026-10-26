"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {formatBuilderBillingAmount} from "./formatBuilderBillingAmount";
import AiCreditsPanel from "./AiCreditsPanel";
import AiCreditPacksPanel from "./AiCreditPacksPanel";
import {
  builderFlowPassed,type BuilderBillingEvidence,
} from "@/lib/billing/platformBillingFlowEvidence";

type Plan={priceId:string;label:string;interval:string;intervalCount:number;currency:string;unitAmountMinor:number};
type Plans={configured:boolean;plans:Plan[]};
type CheckoutAttempt={priceId:string;id:string;created:number};
const ATTEMPT_KEY="zoebuild.platform.checkoutAttempt.v1";
const ATTEMPT_TTL_MS=80*60*1000;
const ATTEMPT_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeStripeDestination(raw:string,expectedHost:"checkout.stripe.com"|"billing.stripe.com"){
  const link=new URL(raw);
  if(link.protocol!=="https:"||link.hostname!==expectedHost||link.username||link.password)
    throw new Error("Untrusted Stripe billing destination.");
  return link.href;
}

function readCheckoutAttempt(priceId:string):CheckoutAttempt{
  try{
    const prior=JSON.parse(sessionStorage.getItem(ATTEMPT_KEY)??"null") as Partial<CheckoutAttempt>|null;
    if(prior?.priceId===priceId&&typeof prior.id==="string"&&ATTEMPT_ID.test(prior.id)&&
      typeof prior.created==="number"&&Date.now()>=prior.created&&Date.now()-prior.created<ATTEMPT_TTL_MS){
      return prior as CheckoutAttempt;
    }
  }catch{/* Private browsing may disallow session storage. */}
  const fresh={priceId,id:crypto.randomUUID(),created:Date.now()};
  try{sessionStorage.setItem(ATTEMPT_KEY,JSON.stringify(fresh));}catch{/* User can still safely retry within this tab. */}
  return fresh;
}

const summaryCard="ui-page-surface rounded-2xl border border-current/10 p-5 sm:p-6";
const actionButton="inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export default function BuilderBillingClient({locale}:{locale:string}){
  const [plans,setPlans]=useState<Plans|null>(null);
  const [verification,setVerification]=useState<BuilderBillingEvidence|null>(null);
  const [verificationUnavailable,setVerificationUnavailable]=useState(false);
  const nextAutomaticRetryAt=useRef(0);
  const [plansError,setPlansError]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [returnState,setReturnState]=useState<"success"|"cancelled"|null>(null);
  const [returnedSession,setReturnedSession]=useState<string|null>(null);
  const attempt=useRef<CheckoutAttempt|null>(null);
  const flowCompleteRef=useRef(false);

  const refresh=useCallback(async(sessionId:string|null,reloadPlans=true)=>{
    setRefreshing(true);
    try{
      const verificationUrl=new URL("/api/billing/verification",window.location.origin);
      if(sessionId)verificationUrl.searchParams.set("session_id",sessionId);
      const [verificationResponse,planResponse]=await Promise.all([
        fetch(verificationUrl.href,{cache:"no-store",credentials:"same-origin"}),
        reloadPlans?fetch("/api/billing/plans",{cache:"no-store",credentials:"same-origin"}):Promise.resolve(null),
      ]);
      if(!verificationResponse.ok)throw new Error("Cannot verify your subscription right now. Check the server configuration and try again.");
      const evidence=await verificationResponse.json() as BuilderBillingEvidence;
      setVerification(evidence);
      setVerificationUnavailable(false);
      nextAutomaticRetryAt.current=0;
      flowCompleteRef.current=builderFlowPassed(evidence);
      if(planResponse){
        if(planResponse.ok){setPlans(await planResponse.json() as Plans);setPlansError(false);}
        else {setPlans({configured:false,plans:[]});setPlansError(true);}
      }
      setError("");
    }catch(cause){
      // Never continue displaying old Stripe evidence as CURRENT after failure.
      setVerificationUnavailable(true);
      nextAutomaticRetryAt.current=Date.now()+120_000;
      setError(cause instanceof Error?cause.message:"Billing verification unavailable.");
    }
    finally{setRefreshing(false);}
  },[]);

  useEffect(()=>{
    const query=new URLSearchParams(window.location.search);
    const checkout=query.get("checkout");
    const result=checkout==="success"||checkout==="cancelled"?checkout:null;
    const sessionId=result==="success"?query.get("session_id"):null;
    setReturnState(result);setReturnedSession(sessionId);
    void refresh(sessionId);
  },[refresh]);

  // The redirect does not prove payment. Recheck server evidence for up to one minute.
  useEffect(()=>{
    if(returnState!=="success")return;
    let polls=0;
    const interval=window.setInterval(()=>{
      if(flowCompleteRef.current||polls>=10){window.clearInterval(interval);return;}
      polls++;
      void refresh(returnedSession,false);
    },6000);
    return ()=>window.clearInterval(interval);
  },[returnState,returnedSession,refresh]);

  // Refresh live Stripe lifecycle evidence without user interaction.
  useEffect(()=>{
    const update=()=>{
      if(document.visibilityState==="visible"&&!busy&&Date.now()>=nextAutomaticRetryAt.current)
        void refresh(returnedSession,false);
    };
    const timer=window.setInterval(update,30000);
    window.addEventListener("focus",update);
    return ()=>{window.clearInterval(timer);window.removeEventListener("focus",update);};
  },[refresh,returnedSession,busy]);

  const startCheckout=async(priceId:string)=>{
    if(busy)return;
    setBusy(true);setError("");
    try{
      if(attempt.current?.priceId!==priceId)attempt.current=readCheckoutAttempt(priceId);
      // A hung network request must not keep "Opening Stripe…" indefinitely.
      const controller=new AbortController();
      const timeout=window.setTimeout(()=>controller.abort(),20000);
      let response:Response;
      try{
        response=await fetch("/api/billing/checkout",{method:"POST",
          credentials:"same-origin",headers:{"Content-Type":"application/json"},signal:controller.signal,
          body:JSON.stringify({priceId,checkoutAttemptId:attempt.current.id,locale}),
        });
      }finally{window.clearTimeout(timeout);}
      const result=await response.json() as {url?:string;error?:string;code?:string};
      if(result.code==="CHECKOUT_ATTEMPT_EXPIRED"){
        attempt.current=null;
        try{sessionStorage.removeItem(ATTEMPT_KEY);}catch{/* no-op */}
      }
      if(!response.ok||!result.url)throw new Error(result.error??"Checkout is unavailable.");
      window.location.assign(safeStripeDestination(result.url,"checkout.stripe.com"));
    }catch(cause){setError(cause instanceof Error && cause.name==="AbortError"
      ?"Stripe Checkout request timed out. Recheck subscription status before retrying this attempt."
      :cause instanceof Error?cause.message:"Checkout unavailable.");setBusy(false);}
  };

  const manageSubscription=async()=>{
    if(busy)return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/billing/portal",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({locale})});
      const data=await response.json() as {url?:string;error?:string};
      if(!response.ok||!data.url)throw new Error(data.error??"Billing management unavailable.");
      window.location.assign(safeStripeDestination(data.url,"billing.stripe.com"));
    }catch(cause){setError(cause instanceof Error?cause.message:"Billing management unavailable.");setBusy(false);}
  };

  const passed=!verificationUnavailable&&verification?builderFlowPassed(verification):false;
  const subscribed=!verificationUnavailable&&verification?.subscriptionActive===true;
  const isLoading=!verification&&!verificationUnavailable;

  return <div className="mt-5 space-y-5 pb-8">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">ZoeBuild billing</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">AI credits & subscription</h2>
        <p className="mt-1 text-sm opacity-70">Buy AI credits once, review your balance, or manage your subscription.</p>
      </div>
      <span className="rounded-full border border-current/15 px-3 py-1.5 text-xs font-medium opacity-75">Purchases are separate from subscriptions</span>
    </header>

    {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">{error}</div>}

    {returnState==="success"&&<div role="status" className={`rounded-xl border px-5 py-4 text-sm ${passed?"border-emerald-500/40 bg-emerald-500/10":"border-amber-500/40 bg-amber-500/10"}`}>
      <strong>{passed?"Stripe confirmed this subscription and its access.":"Returned from Stripe — verifying on the server."}</strong>
      <p className="mt-1 opacity-80">{passed?"The payment session, webhook, owned subscription, and subscription-backed AI grants all agree.":
        verification?.checkoutReturn==="paid_unreconciled"?"Stripe confirms this payment. The webhook or subscription record has not finished reconciling. Do not pay again; recheck or inspect webhook delivery.":"A success redirect alone is not payment confirmation. We are checking the signed webhook and entitlement records."}</p>
    </div>}
    {returnState==="cancelled"&&<div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm">
      Checkout was cancelled. This page has not verified a new payment. You can safely check your status before retrying.
    </div>}

    <AiCreditPacksPanel locale={locale}/>

    <div className="grid items-start gap-5 xl:grid-cols-2">
      <AiCreditsPanel locale={locale}/>
      <section aria-labelledby="builder-plan-heading" className={`${summaryCard} space-y-5 min-w-0`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest opacity-60">Your subscription</div>
            <h3 id="builder-plan-heading" className="mt-1 text-xl font-bold">Builder AI access</h3>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${subscribed?"bg-emerald-500/15 text-emerald-600 dark:text-emerald-300":"bg-slate-500/10"}`}>
            {verificationUnavailable?"Verification unavailable":isLoading?"Checking":subscribed?"Subscription active":"Not subscribed"}
          </span>
        </div>
        {verificationUnavailable?<div role="status" className="rounded-xl border border-amber-500/30 p-5 text-sm">
          Current subscription status cannot be verified while the session authority is unavailable. No payment or cancellation is implied. Do not subscribe again; use Refresh or reconnect after the server recovers.
        </div>:isLoading?<div role="status" className="animate-pulse rounded-xl bg-slate-500/10 p-8 text-sm opacity-70">Loading verified billing information…</div>:
          subscribed?<div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
              <div className="font-semibold">Your Builder subscription is active</div>
              <p className="mt-2 text-sm opacity-75">Stripe status: {verification.subscriptionStatus??"active"}</p>
              {verification.currentPeriodEnd&&<p className="mt-1 text-sm opacity-75">Current Stripe period ends: {new Date(verification.currentPeriodEnd).toLocaleDateString(locale)}</p>}
              {(verification.cancelAtPeriodEnd||verification.cancellationDate)&&<p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">Cancellation scheduled by Stripe{verification.cancellationDate?` for ${new Date(verification.cancellationDate).toLocaleDateString(locale)}`:" at period end"}. No future renewal is shown.</p>}
              {verification.nextBillingDate&&verification.nextBillingAmountMinor!==null&&verification.nextBillingAmountMinor!==undefined&&verification.nextBillingCurrency&&<p className="mt-1 text-sm opacity-75">Stripe upcoming invoice estimate: {formatBuilderBillingAmount(locale,verification.nextBillingCurrency,verification.nextBillingAmountMinor)} on {new Date(verification.nextBillingDate).toLocaleDateString(locale)}</p>}
              {!verification.cancelAtPeriodEnd&&!verification.nextBillingDate&&<p className="mt-1 text-xs opacity-65">Upcoming invoice not available from Stripe. Check the billing portal for the latest billing schedule.</p>}
            </div>
            <button type="button" disabled={busy} onClick={manageSubscription} className={`${actionButton} w-full bg-slate-950 text-white dark:bg-white dark:text-slate-950`}>
              Manage subscription <span aria-hidden="true" className="ml-2">↗</span>
            </button>
          </div>:<div className="space-y-4">
            {plansError&&<div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              Stripe plans could not be loaded. Check the server's Stripe key and approved Builder price IDs; no purchase was started.
            </div>}
            {verification?.mode==="missing"&&<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              The platform Stripe key is missing or invalid on this server. Checkout is unavailable until it is configured.
            </div>}
            {verification?.mode==="live"&&<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-medium">
              Live Stripe mode: subscribing here would initiate a real payment, not a sandbox test.
            </div>}
            {(!plans?.plans.length)?<p className="rounded-xl border border-dashed border-current/20 p-5 text-sm opacity-70">No verified Builder subscription plans are available.</p>:
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">{plans.plans.map(plan=><article key={plan.priceId} className="rounded-2xl border border-current/15 p-5">
                <div className="text-sm font-semibold">{plan.label}</div>
                <div className="mt-3 text-2xl font-bold">{formatBuilderBillingAmount(locale,plan.currency,plan.unitAmountMinor)}</div>
                <p className="mt-1 text-xs opacity-65">Every {plan.intervalCount>1?`${plan.intervalCount} `:""}{plan.interval}{plan.intervalCount>1?"s":""}</p>
                <button type="button" disabled={busy||!verification||verificationUnavailable||verification.mode==="missing"} onClick={()=>startCheckout(plan.priceId)}
                  className={`${actionButton} mt-5 w-full bg-slate-950 text-white dark:bg-white dark:text-slate-950`}>
                  {busy?"Opening Stripe…":verification?.mode==="live"?"Subscribe · Live payment":"Continue to Stripe test Checkout"}
                  {!busy&&<span aria-hidden="true" className="ml-2">↗</span>}
                </button>
              </article>)}</div>}
          </div>}
        <details className="rounded-xl border border-current/10 p-4 text-xs leading-5 opacity-75" aria-label="Builder plan benefits and limitations">
          <summary className="cursor-pointer text-sm font-semibold opacity-100">What's included in the subscription?</summary>
          <div className="mt-3 space-y-2">
            <p>Your verified Builder AI subscription controls generation and source-editing access. Each entitlement can be revoked independently.</p>
            <p>AI usage credits are separate. This plan does not promise included credits, unlimited generation, custom domains, databases, or advanced publishing features.</p>
            <p>Pro capabilities appear only after they are implemented and authorized. Platform billing is separate from payments accepted by sites you build.</p>
          </div>
        </details>
      </section>

    </div>
  </div>;
}
