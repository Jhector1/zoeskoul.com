import {notFound,redirect} from "next/navigation";
import {supportedLocales} from "@zoeskoul/app-config";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";
import {buildZoeBuildWebAuthenticateUrl} from "@/lib/webAuthHandoff";
import BuilderBillingClient from "./BuilderBillingClient";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default async function BuilderBillingPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(!supportedLocales.some(v=>v===locale))notFound();
 const access=await loadCurrentBuildAccessSnapshot();
 if(!access.userId)redirect(buildZoeBuildWebAuthenticateUrl({locale,callbackUrl:`/${locale}/billing`}));
 return <main className="ui-container py-8">
  <div className="ui-section-kicker">Zoé Build</div>
  <h1 className="ui-section-title">Billing & AI credits</h1>
  <p className="ui-section-subtitle">Manage your Builder subscription, review AI usage, and open Stripe for payment methods and invoices. Storefront payments remain separate.</p>
  <BuilderBillingClient locale={locale}/>
 </main>;
}
