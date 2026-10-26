import {ZOE_CUSTOM_TOPUP_MARKER, ZOE_TOP_UP_POLICY, quoteZoeTopUpUsdMinor}
  from "@zoeskoul/platform-server/ai-credits/customCreditTopUp";

/** Checkout verification is read-only by default. Explicit customer cancellation
 * may expire only a fully authenticated, owner-bound, open unpaid TEST session. */
export type RecoveryAttempt = Readonly<{
  userId:string; priceId:string; customerId:string; amountUsdMinor:number|null;
  creditUnits:bigint|null; pricingVersion:string|null; stripeSessionId:string|null;
}>;
export type RecoverySession = Readonly<{
  id:string; livemode:boolean; mode:string; status:string; paymentStatus:string;
  customer:string|null; url:string|null; metadata:Readonly<Record<string,string>>|null;
  amountTotal:number|null; currency:string|null; paymentIntent:string|null;
}>;
export type RecoveryDeps = Readonly<{
  findAttempt(attemptId:string):Promise<RecoveryAttempt|null>;
  findUserCustomer(userId:string):Promise<string|null>;
  retrieveSession(sessionId:string):Promise<RecoverySession>;
  listSessions(customerId:string):Promise<Readonly<{data:readonly RecoverySession[];hasMore:boolean}>>;
  /** Mutating Stripe action: invoked ONLY on explicit customer cancellation. */
  expireSession(sessionId:string):Promise<void>;
  listLineItems(sessionId:string):Promise<Readonly<{data:readonly {
    quantity:number|null;priceId:string|null;amountSubtotal:number;
  }[];hasMore:boolean}>>;
  /** Read-only evidence written atomically by signed-webhook credit fulfillment. */
  findFundedPurchase(input:Readonly<{userId:string;paymentIntentId:string}>):Promise<Readonly<{
    userId:string;kind:string;grantedUnits:bigint;grantDelta:bigint;
    reversedUnits:bigint;reversalTargetUnits:bigint;reversalShortfallUnits:bigint;
    riskFrozen:boolean;
  }> | null>;
}>;
export type RecoveryResult = Readonly<{
  state:"open"|"expired_unpaid"|"completed"|"funded"|"unresolved";
  url?:string;
}>;
const ATTEMPT=/^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const USER=/^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,159}$/;
const SESSION=/^cs_test_[A-Za-z0-9_]+$/;
const CUSTOMER=/^cus_[A-Za-z0-9_]+$/;
const PAYMENT=/^pi_[A-Za-z0-9_]+$/;
const unresolved=():RecoveryResult=>({state:"unresolved"});
/** A successful Stripe expiration must be re-read from Stripe before retiring
 * the browser's original retry key. Failed/racing expiration remains unresolved. */
async function expireVerifiedSession(deps:RecoveryDeps,session:RecoverySession):Promise<RecoveryResult>{
  try{
    await deps.expireSession(session.id);
    const after=await deps.retrieveSession(session.id);
    if(after.id===session.id && after.livemode===false && after.mode==="payment" &&
       after.customer===session.customer && after.status==="expired" &&
       after.paymentStatus==="unpaid") return {state:"expired_unpaid"};
  }catch{
    // Stripe may have completed the session concurrently, or connectivity failed.
    // Neither case authorizes local retry-key removal or a second checkout.
  }
  return unresolved();
}
function trustedStripeUrl(value:string|null):value is string{
  if(!value)return false;
  try{const target=new URL(value);
    return target.protocol==="https:"&&target.hostname==="checkout.stripe.com"&&
      !target.username&&!target.password;
  }catch{return false;}
}

export async function verifyCustomCreditCheckout(input:Readonly<{
  deps:RecoveryDeps; authenticatedUserId:string; checkoutAttemptId:string;
  amountUsdMinor:number;cancel?:boolean;
}>):Promise<RecoveryResult>{
  if(!USER.test(input.authenticatedUserId)||!ATTEMPT.test(input.checkoutAttemptId))return unresolved();
  let quote:ReturnType<typeof quoteZoeTopUpUsdMinor>;
  try{quote=quoteZoeTopUpUsdMinor(input.amountUsdMinor);}catch{return unresolved();}
  const saved=await input.deps.findAttempt(input.checkoutAttemptId);
  if(!saved||saved.userId!==input.authenticatedUserId||
      saved.priceId!==ZOE_CUSTOM_TOPUP_MARKER||saved.amountUsdMinor!==quote.amountUsdMinor||
      saved.creditUnits!==BigInt(quote.creditUnits)||saved.pricingVersion!==ZOE_TOP_UP_POLICY.version||
      !CUSTOMER.test(saved.customerId))return unresolved();
  const currentCustomer=await input.deps.findUserCustomer(input.authenticatedUserId);
  if(currentCustomer!==saved.customerId)return unresolved();
  let stripeSession:RecoverySession;
  if(saved.stripeSessionId){
    if(!SESSION.test(saved.stripeSessionId))return unresolved();
    stripeSession=await input.deps.retrieveSession(saved.stripeSessionId);
    if(stripeSession.id!==saved.stripeSessionId)return unresolved();
  }else{
    // A session may have been created before the DB reference was recorded.
    // A finite/truncated Stripe history is NEVER evidence that it was unpaid.
    const recent=await input.deps.listSessions(saved.customerId);
    if(recent.hasMore||recent.data.length>100)return unresolved();
    const matches=recent.data.filter(s=>s.metadata?.checkoutAttemptId===input.checkoutAttemptId&&
      s.metadata?.zoebuildAiCreditPurchase==="v2");
    if(matches.length!==1)return unresolved();
    stripeSession=matches[0]!;
  }
  if(!SESSION.test(stripeSession.id)||stripeSession.livemode!==false||
      stripeSession.mode!=="payment"||stripeSession.customer!==saved.customerId||
      stripeSession.currency!=="usd"||stripeSession.amountTotal!==quote.amountUsdMinor||
      stripeSession.metadata?.zoebuildAiCreditPurchase!=="v2"||
      stripeSession.metadata?.purchaseKind!==ZOE_CUSTOM_TOPUP_MARKER||
      stripeSession.metadata?.checkoutAttemptId!==input.checkoutAttemptId||
      stripeSession.metadata?.amountUsdMinor!==String(quote.amountUsdMinor)||
      stripeSession.metadata?.creditUnits!==quote.creditUnits||
      stripeSession.metadata?.pricingVersion!==ZOE_TOP_UP_POLICY.version)
    return unresolved();
  const lines=await input.deps.listLineItems(stripeSession.id);
  if(lines.hasMore||lines.data.length!==1||lines.data[0]?.quantity!==1||
      !/^price_[A-Za-z0-9_]+$/.test(lines.data[0]?.priceId??"")||
      lines.data[0]?.amountSubtotal!==quote.amountUsdMinor)return unresolved();
  if(stripeSession.status==="open"&&stripeSession.paymentStatus==="unpaid"&&
     trustedStripeUrl(stripeSession.url))
    return input.cancel?expireVerifiedSession(input.deps,stripeSession):
      {state:"open",url:stripeSession.url!};
  if(stripeSession.status==="expired"&&stripeSession.paymentStatus==="unpaid")
    return {state:"expired_unpaid"};
  if(stripeSession.status==="complete") {
    // A Stripe redirect, completed session, or "paid" flag is NOT evidence
    // that the signed webhook granted credits. Require the immutable DB
    // attempt -> Stripe PaymentIntent -> canonical purchased ledger grant.
    if(stripeSession.paymentStatus!=="paid" ||
       !saved.stripeSessionId || saved.stripeSessionId!==stripeSession.id ||
       !stripeSession.paymentIntent || !PAYMENT.test(stripeSession.paymentIntent))
      return {state:"completed"};
    const funded=await input.deps.findFundedPurchase({userId:input.authenticatedUserId,
      paymentIntentId:stripeSession.paymentIntent});
    if(funded && funded.userId===input.authenticatedUserId &&
       funded.kind==="purchased" && funded.grantedUnits===BigInt(quote.creditUnits) &&
       funded.grantDelta===BigInt(quote.creditUnits) &&
       funded.reversedUnits===0n && funded.reversalTargetUnits===0n &&
       funded.reversalShortfallUnits===0n && !funded.riskFrozen)
      return {state:"funded"};
    return {state:"completed"};
  }
  return unresolved();
}


/** Read-only legacy FIXED-pack recovery. Historical priceIds are not offered
 * for new purchases, and only a TEST-mode Stripe session tied to the immutable
 * owner-bound attempt may be resumed or retired after verified completion. */
export async function verifyFixedCreditCheckout(input:Readonly<{
  deps:RecoveryDeps;authenticatedUserId:string;checkoutAttemptId:string;priceId:string;cancel?:boolean;
}>):Promise<RecoveryResult>{
  if(!USER.test(input.authenticatedUserId)||!ATTEMPT.test(input.checkoutAttemptId)||
     !/^price_[A-Za-z0-9_]+$/.test(input.priceId))return unresolved();
  const saved=await input.deps.findAttempt(input.checkoutAttemptId);
  if(!saved||saved.userId!==input.authenticatedUserId||saved.priceId!==input.priceId||
     saved.amountUsdMinor!==null||saved.creditUnits!==null||saved.pricingVersion!==null||
     !CUSTOMER.test(saved.customerId))return unresolved();
  const currentCustomer=await input.deps.findUserCustomer(input.authenticatedUserId);
  if(currentCustomer!==saved.customerId)return unresolved();
  let stripeSession:RecoverySession;
  if(saved.stripeSessionId){
    if(!SESSION.test(saved.stripeSessionId))return unresolved();
    stripeSession=await input.deps.retrieveSession(saved.stripeSessionId);
    if(stripeSession.id!==saved.stripeSessionId)return unresolved();
  }else{
    const recent=await input.deps.listSessions(saved.customerId);
    if(recent.hasMore||recent.data.length>100)return unresolved();
    const matching=recent.data.filter(s=>s.metadata?.checkoutAttemptId===input.checkoutAttemptId&&
      s.metadata?.zoebuildAiCreditPurchase==="v1");
    if(matching.length!==1)return unresolved();
    stripeSession=matching[0]!;
  }
  if(!SESSION.test(stripeSession.id)||stripeSession.livemode!==false||
     stripeSession.mode!=="payment"||stripeSession.customer!==saved.customerId||
     stripeSession.currency!=="usd"||!Number.isSafeInteger(stripeSession.amountTotal)||
     (stripeSession.amountTotal??0)<500||(stripeSession.amountTotal??0)>50000||
     stripeSession.metadata?.zoebuildAiCreditPurchase!=="v1"||
     stripeSession.metadata?.creditPackPriceId!==input.priceId||
     stripeSession.metadata?.checkoutAttemptId!==input.checkoutAttemptId)return unresolved();
  const lines=await input.deps.listLineItems(stripeSession.id);
  if(lines.hasMore||lines.data.length!==1||lines.data[0]?.quantity!==1||
     lines.data[0]?.priceId!==input.priceId||
     lines.data[0]?.amountSubtotal!==stripeSession.amountTotal)return unresolved();
  if(stripeSession.status==="open"&&stripeSession.paymentStatus==="unpaid"&&
     trustedStripeUrl(stripeSession.url))return input.cancel?
       expireVerifiedSession(input.deps,stripeSession):{state:"open",url:stripeSession.url!};
  if(stripeSession.status==="expired"&&stripeSession.paymentStatus==="unpaid")
    return {state:"expired_unpaid"};
  if(stripeSession.status==="complete"){
    if(stripeSession.paymentStatus!=="paid"||!saved.stripeSessionId||
       saved.stripeSessionId!==stripeSession.id||!stripeSession.paymentIntent||
       !PAYMENT.test(stripeSession.paymentIntent))return {state:"completed"};
    const funded=await input.deps.findFundedPurchase({userId:input.authenticatedUserId,
      paymentIntentId:stripeSession.paymentIntent});
    // Fixed packs may be retired, so use the canonical immutable grant rather
    // than guessing its historical credits from today's product catalog.
    if(funded&&funded.userId===input.authenticatedUserId&&funded.kind==="purchased"&&
       funded.grantedUnits>0n&&funded.grantDelta===funded.grantedUnits&&
       funded.reversedUnits===0n&&funded.reversalTargetUnits===0n&&
       funded.reversalShortfallUnits===0n&&!funded.riskFrozen)return {state:"funded"};
    return {state:"completed"};
  }
  return unresolved();
}
