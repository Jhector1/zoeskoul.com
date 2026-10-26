"use client";
import {useCallback,useEffect,useState} from "react";
import {formatCustomerCredits} from "./customerCreditDisplay";

type LedgerActivity={kind:string;availableDeltaUnits:string;reservedDeltaUnits:string;at:string};
type CreditLedgerSnapshot={unit:"ledger_unit";subscriptionAvailableUnits:string;
  purchasedAvailableUnits:string;reservedUnits:string;walletFrozen:boolean;
  meteringStatus:"not_activated"|"activation_incomplete";
  creditTopUpsAvailable:false;activity:LedgerActivity[];
  aiAccess:{canGenerateWithAi:boolean;canEditWithAi:boolean};
  billingReviews:{modelProfilesRegistered:boolean;operationalApprovalsRegistered:boolean};};
const number=(units:string)=>{try{return BigInt(units).toLocaleString("en-US");}catch{return "Unavailable";}};
export default function AiCreditsPanel({locale}:{locale:string}){
  const [snapshot,setSnapshot]=useState<CreditLedgerSnapshot|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const reload=useCallback(async()=>{
    try{
      const response=await fetch("/api/billing/credits",{credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw new Error("Credit information is temporarily unavailable.");
      const data=await response.json() as CreditLedgerSnapshot;
      if(data.unit!=="ledger_unit")throw new Error("Credit units were not verified.");
      setSnapshot(data);setError("");
    }catch(cause){setSnapshot(null);setError(cause instanceof Error?cause.message:"Credit information unavailable.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void reload();const onFocus=()=>{if(document.visibilityState==="visible")void reload();};
    const timer=window.setInterval(onFocus,60000);window.addEventListener("focus",onFocus);
    return ()=>{window.clearInterval(timer);window.removeEventListener("focus",onFocus);};},[reload]);
  return <section aria-labelledby="zoebuild-ai-credit-heading" className="ui-page-surface min-w-0 space-y-4 rounded-2xl border border-current/10 p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest opacity-60">Your wallet</p>
        <h3 id="zoebuild-ai-credit-heading" className="mt-1 text-xl font-bold">AI credit balance</h3>
      </div>
      <button type="button" onClick={()=>void reload()} className="min-h-10 rounded-lg border border-current/20 px-3 py-2 text-xs font-semibold">Refresh balance</button>
    </div>
    {loading&&!snapshot&&<p role="status" className="text-sm opacity-70">Reading your credit ledger…</p>}
    {error&&<p role="status" className="rounded-xl border border-amber-500/30 p-3 text-sm">{error}</p>}
    {snapshot&&<>
      <div className="rounded-2xl bg-slate-500/10 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-65">Available customer credits</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <strong className="text-3xl font-bold tabular-nums sm:text-4xl">{formatCustomerCredits((BigInt(snapshot.subscriptionAvailableUnits)+BigInt(snapshot.purchasedAvailableUnits)).toString(),locale)}</strong>
          <span className="text-sm font-medium opacity-70">credits</span>
        </div>
        <details className="mt-3 text-xs opacity-70">
          <summary className="cursor-pointer">View exact ledger units</summary>
          <p className="mt-1">{number((BigInt(snapshot.subscriptionAvailableUnits)+BigInt(snapshot.purchasedAvailableUnits)).toString())} internal ledger units. This is not a cash balance or a promise of a fixed number of AI requests.</p>
        </details>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div className="rounded-xl border border-current/10 p-4"><p className="opacity-65">Purchased</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatCustomerCredits(snapshot.purchasedAvailableUnits,locale)} <span className="text-xs font-normal opacity-60">credits</span></p></div>
        <div className="rounded-xl border border-current/10 p-4"><p className="opacity-65">Subscription allocation</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatCustomerCredits(snapshot.subscriptionAvailableUnits,locale)} <span className="text-xs font-normal opacity-60">credits</span></p></div>
      </div>
      {snapshot.walletFrozen&&<p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">AI credit spending is temporarily restricted. Contact support before trying again.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-70">
        <span>Reserved for unfinished AI work</span>
        <strong className="tabular-nums">{formatCustomerCredits(snapshot.reservedUnits,locale)} credits</strong>
      </div>
      <details className="rounded-xl border border-current/10 p-4 text-sm" aria-label="Credit activity and account details">
        <summary className="cursor-pointer font-semibold">Activity & access details</summary>
        <div className="mt-4 space-y-4">
          <div>
            <h4 className="font-medium">Recent credit activity</h4>
            {!snapshot.activity.length?<p className="mt-1 text-sm opacity-65">No recorded credit activity yet.</p>:
              <ul className="mt-2 space-y-2">{snapshot.activity.map((entry,index)=><li key={`${entry.at}-${index}`} className="flex justify-between gap-3 text-xs">
                <span className="opacity-75">{entry.kind} · {new Date(entry.at).toLocaleDateString(locale)}</span>
                <span className="font-semibold tabular-nums">{number(entry.availableDeltaUnits)} ledger units</span>
              </li>)}</ul>}
          </div>
          <div className="border-t border-current/10 pt-3 text-xs leading-5 opacity-75">
            <p>AI editing access: <strong>{snapshot.aiAccess.canEditWithAi?"Active":"Not active"}</strong> · Project generation: <strong>{snapshot.aiAccess.canGenerateWithAi?"Active":"Not active"}</strong></p>
            <p className="mt-2">Reviewed model billing profiles: {snapshot.billingReviews.modelProfilesRegistered?"Registered":"Not registered"} · Operational approvals: {snapshot.billingReviews.operationalApprovalsRegistered?"Registered":"Not registered"}</p>
            <p className="mt-2">{snapshot.meteringStatus==="not_activated"?"AI credit spending is not yet activated; editing access does not require purchasing credits.":"AI credit enforcement is configured, but live AI execution approval is incomplete."}</p>
            <p className="mt-2">Subscriptions grant feature access; credits pay for approved metered AI usage. Credits do not unlock Pro features, and available credits do not authorize an unapproved paid AI operation.</p>
          </div>
        </div>
      </details>
    </>}
  </section>;
}
