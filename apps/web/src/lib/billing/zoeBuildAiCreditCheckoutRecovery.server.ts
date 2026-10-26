import {withCheckoutRecoveryAudit} from "./zoeBuildAiCreditCheckoutDiagnostics";
import "server-only";
import {prisma} from "@/lib/prisma";
import {getStripe} from "@/lib/stripe";
import {verifyCustomCreditCheckout,verifyFixedCreditCheckout,type RecoveryDeps}
  from "./zoeBuildAiCreditCheckoutRecovery";

const deps:RecoveryDeps={
  async findAttempt(attemptId){
    return withCheckoutRecoveryAudit("attempt",()=>prisma.zoeBuildAiCreditCheckoutAttempt.findUnique({
      where:{attemptId},select:{userId:true,priceId:true,customerId:true,
        amountUsdMinor:true,creditUnits:true,pricingVersion:true,stripeSessionId:true},
    }));
  },
  async findUserCustomer(userId){
    const user=await withCheckoutRecoveryAudit("customer",()=>prisma.user.findUnique({where:{id:userId},select:{stripeCustomerId:true}}));
    return user?.stripeCustomerId??null;
  },
  async retrieveSession(id){
    const s=await withCheckoutRecoveryAudit("stripe-session",()=>getStripe().checkout.sessions.retrieve(id));
    return {id:s.id,livemode:s.livemode,mode:s.mode,status:s.status??"unknown",
      paymentStatus:s.payment_status,customer:typeof s.customer==="string"?s.customer:s.customer?.id??null,
      url:s.url,metadata:s.metadata,amountTotal:s.amount_total,currency:s.currency,
      paymentIntent:typeof s.payment_intent==="string"?s.payment_intent:s.payment_intent?.id??null};
  },
  async listSessions(customerId){
    const response=await withCheckoutRecoveryAudit("stripe-history",()=>getStripe().checkout.sessions.list({customer:customerId,limit:100}));
    return {hasMore:response.has_more,data:response.data.map(s=>({
      id:s.id,livemode:s.livemode,mode:s.mode,status:s.status??"unknown",
      paymentStatus:s.payment_status,customer:typeof s.customer==="string"?s.customer:s.customer?.id??null,
      url:s.url,metadata:s.metadata,amountTotal:s.amount_total,currency:s.currency,
      paymentIntent:typeof s.payment_intent==="string"?s.payment_intent:s.payment_intent?.id??null,
    }))};
  },
  async findFundedPurchase({userId,paymentIntentId}){
    // Source and event keys are identical to the signed-webhook grant path.
    // No new grant, Stripe write, or database mutation is performed here.
    const sourceKey=`stripe:zoebuild:pi:${paymentIntentId}`;
    if(sourceKey.length>160 || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId))return null;
    const [lot,wallet]=await withCheckoutRecoveryAudit("grant-ledger",()=>Promise.all([
      prisma.aiCreditLot.findUnique({where:{sourceKey},select:{
        userId:true,kind:true,grantedUnits:true,reversedUnits:true,
        reversalTargetUnits:true,reversalShortfallUnits:true,
        entries:{where:{kind:"grant",eventKey:`grant:${sourceKey}`},
          select:{userId:true,availableDelta:true},take:1},
      }}),
      prisma.aiCreditWallet.findUnique({where:{userId},select:{riskFrozenAt:true}}),
    ]));
    const grant=lot?.entries[0];
    if(!lot || lot.userId!==userId || !grant || grant.userId!==userId)return null;
    return {userId:lot.userId,kind:lot.kind,grantedUnits:lot.grantedUnits,
      grantDelta:grant.availableDelta,reversedUnits:lot.reversedUnits,
      reversalTargetUnits:lot.reversalTargetUnits,
      reversalShortfallUnits:lot.reversalShortfallUnits,
      riskFrozen:Boolean(wallet?.riskFrozenAt)};
  },
  async expireSession(id){
    // Stripe's Checkout expiration is only available for an OPEN session.
    // Pure verifier has checked owner, customer, amount, metadata and line items.
    await withCheckoutRecoveryAudit("stripe-expire",()=>getStripe().checkout.sessions.expire(id));
  },
  async listLineItems(id){
    const response=await withCheckoutRecoveryAudit("line-items",()=>getStripe().checkout.sessions.listLineItems(id,{limit:2}));
    return {hasMore:response.has_more,data:response.data.map(item=>({
      quantity:item.quantity,priceId:item.price?.id??null,amountSubtotal:item.amount_subtotal,
    }))};
  },
};
export async function verifyCustomCreditCheckoutForAuthenticatedUser(input:Readonly<{
  authenticatedUserId:string;checkoutAttemptId:string;amountUsdMinor:number;cancel?:boolean;
}>){return verifyCustomCreditCheckout({...input,deps});}


export async function verifyFixedCreditCheckoutForAuthenticatedUser(input:Readonly<{
  authenticatedUserId:string;checkoutAttemptId:string;priceId:string;cancel?:boolean;
}>){return verifyFixedCreditCheckout({...input,deps});}
