import {NextResponse} from "next/server";
import {resolveBuildAccess} from "@zoeskoul/build-application";
import {ZOEBUILD_VERIFIED_AI_BILLING_PROFILES} from "@/lib/build/verifiedAiCreditReservationPolicy";
import {ZOEBUILD_APPROVED_BILLING_OPERATIONS} from "@/lib/build/productionAiBillingReadiness";
import {prisma} from "@zoeskoul/platform-server/prisma";
import {getAiCreditBalance} from "@zoeskoul/platform-server/ai-credits/ledger";
import {CREDIT_DOMAINS} from "@zoeskoul/platform-server/credits/core";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const json=(payload:unknown,status=200)=>NextResponse.json(payload,{status,headers});

/** User-scoped ledger read. No synthetic credits, Stripe calls, or billing mutations. */
export async function GET(request:Request){
  let access: Awaited<ReturnType<typeof loadCurrentBuildAccessSnapshot>>;
  try { access = await loadCurrentBuildAccessSnapshot(request, {requireAuthority:true}); }
  catch { return json({code:"SESSION_AUTHORITY_UNAVAILABLE"},503); }
  if(!access.userId)return json({error:"Unauthorized"},401);
  try{
    const decision=resolveBuildAccess(access);
    const [balance,activity,wallet]=await Promise.all([
      getAiCreditBalance({client:prisma,userId:access.userId}),
      prisma.aiCreditLedgerEntry.findMany({where:{userId:access.userId},
        select:{kind:true,availableDelta:true,reservedDelta:true,createdAt:true},
        orderBy:{createdAt:"desc"},take:12}),
      prisma.aiCreditWallet.findUnique({where:{userId:access.userId},select:{riskFrozenAt:true}}),
    ]);
    return json({
      unit:"ledger_unit",creditDomain:CREDIT_DOMAINS.builder,subscriptionAvailableUnits:balance.subscriptionAvailableUnits,
      purchasedAvailableUnits:balance.purchasedAvailableUnits,reservedUnits:balance.reservedUnits,
      walletFrozen:Boolean(wallet?.riskFrozenAt),
      aiAccess:{canGenerateWithAi:decision.canGenerateWithAi,canEditWithAi:decision.canEditWithAi},
      billingReviews:{
        modelProfilesRegistered:ZOEBUILD_VERIFIED_AI_BILLING_PROFILES.length>0,
        operationalApprovalsRegistered:ZOEBUILD_APPROVED_BILLING_OPERATIONS.length>0,
      },
      meteringStatus:process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT==="required"
        ? "activation_incomplete" : "not_activated",
      creditTopUpsAvailable:false,
      activity:activity.map(item=>({kind:item.kind,availableDeltaUnits:item.availableDelta.toString(),
        reservedDeltaUnits:item.reservedDelta.toString(),at:item.createdAt.toISOString()})),
    });
  }catch{return json({error:"Credit ledger temporarily unavailable"},503);}
}
