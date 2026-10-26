import type { PrismaClient } from "@zoeskoul/db";
import { ZoeBuildAiCreditFundingError } from "./zoeBuildAiCreditStripeFunding";

/** E16C5A2B durable identity; no Stripe API and no credit movement. */
const ATTEMPT = /^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const USER = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,159}$/;
const PRICE = /^price_[A-Za-z0-9_]+$/;
const CUSTOMER = /^cus_[A-Za-z0-9_]+$/;
const SESSION = /^cs_test_[A-Za-z0-9_]+$/;
function refuse(code: string): never { throw new ZoeBuildAiCreditFundingError(code); }

export async function claimZoeBuildAiCreditCheckoutAttempt(input: Readonly<{
  client: PrismaClient; attemptId: string; userId: string;
  priceId: string; customerId: string;
}>): Promise<{ claimed: boolean; stripeSessionId: string | null }> {
  if (!ATTEMPT.test(input.attemptId) || !USER.test(input.userId) ||
      !PRICE.test(input.priceId) || !CUSTOMER.test(input.customerId))
    refuse("AI_CREDIT_ATTEMPT_INVALID");
  const data = {attemptId: input.attemptId, userId: input.userId,
    priceId: input.priceId, customerId: input.customerId};
  const inserted = await input.client.zoeBuildAiCreditCheckoutAttempt.createMany({
    data: [data], skipDuplicates: true,
  });
  const found = await input.client.zoeBuildAiCreditCheckoutAttempt.findUnique({
    where: {attemptId: input.attemptId},
    select: {userId: true, priceId: true, customerId: true, stripeSessionId: true},
  });
  if (!found || found.userId !== data.userId || found.priceId !== data.priceId ||
      found.customerId !== data.customerId)
    refuse("AI_CREDIT_ATTEMPT_OWNERSHIP_CONFLICT");
  return {claimed: inserted.count === 1, stripeSessionId: found.stripeSessionId};
}

export async function recordZoeBuildAiCreditCheckoutSession(input: Readonly<{
  client: PrismaClient; attemptId: string; userId: string; priceId: string;
  customerId: string; stripeSessionId: string;
}>): Promise<{ recorded: boolean }> {
  if (!ATTEMPT.test(input.attemptId) || !USER.test(input.userId) ||
      !PRICE.test(input.priceId) || !CUSTOMER.test(input.customerId) ||
      !SESSION.test(input.stripeSessionId))
    refuse("AI_CREDIT_ATTEMPT_INVALID");
  const matched = {attemptId: input.attemptId, userId: input.userId,
    priceId: input.priceId, customerId: input.customerId};
  const updated = await input.client.zoeBuildAiCreditCheckoutAttempt.updateMany({
    where: {...matched, stripeSessionId: null},
    data: {stripeSessionId: input.stripeSessionId},
  });
  const found = await input.client.zoeBuildAiCreditCheckoutAttempt.findUnique({
    where: {attemptId: input.attemptId},
    select: {userId: true, priceId: true, customerId: true, stripeSessionId: true},
  });
  if (!found || found.userId !== matched.userId || found.priceId !== matched.priceId ||
      found.customerId !== matched.customerId || found.stripeSessionId !== input.stripeSessionId)
    refuse("AI_CREDIT_ATTEMPT_SESSION_CONFLICT");
  return {recorded: updated.count === 1};
}


/** V12J.28C: independent immutable test-only custom purchase intent. */
import { quoteZoeTopUpUsdMinor, ZOE_TOP_UP_POLICY, ZOE_CUSTOM_TOPUP_MARKER } from "@zoeskoul/platform-server/ai-credits/customCreditTopUp";
const customIdentity = (input: Readonly<{attemptId:string; userId:string; customerId:string;
  amountUsdMinor:number}>) => {
  if (!ATTEMPT.test(input.attemptId) || !USER.test(input.userId) ||
      !CUSTOMER.test(input.customerId)) refuse("AI_CREDIT_ATTEMPT_INVALID");
  let quote: ReturnType<typeof quoteZoeTopUpUsdMinor>;
  try { quote = quoteZoeTopUpUsdMinor(input.amountUsdMinor); }
  catch { return refuse("AI_CREDIT_TOPUP_AMOUNT_INVALID"); }
  return {attemptId:input.attemptId, userId:input.userId,
    priceId:ZOE_CUSTOM_TOPUP_MARKER, customerId:input.customerId,
    amountUsdMinor:quote.amountUsdMinor, creditUnits:BigInt(quote.creditUnits),
    pricingVersion:ZOE_TOP_UP_POLICY.version};
};
export async function claimZoeBuildCustomCheckoutAttempt(input: Readonly<{
  client:PrismaClient; attemptId:string; userId:string; customerId:string;
  amountUsdMinor:number;
}>):Promise<{claimed:boolean; stripeSessionId:string|null}> {
  const data=customIdentity(input);
  const inserted=await input.client.zoeBuildAiCreditCheckoutAttempt.createMany({
    data:[data], skipDuplicates:true,
  });
  const found=await input.client.zoeBuildAiCreditCheckoutAttempt.findUnique({
    where:{attemptId:input.attemptId},
    select:{userId:true,priceId:true,customerId:true,stripeSessionId:true,
      amountUsdMinor:true,creditUnits:true,pricingVersion:true},
  });
  if (!found || found.userId!==data.userId || found.priceId!==data.priceId ||
      found.customerId!==data.customerId ||
      found.amountUsdMinor!==data.amountUsdMinor ||
      found.creditUnits!==data.creditUnits ||
      found.pricingVersion!==data.pricingVersion)
    refuse("AI_CREDIT_ATTEMPT_OWNERSHIP_CONFLICT");
  return {claimed:inserted.count===1,stripeSessionId:found.stripeSessionId};
}
export async function recordZoeBuildCustomCheckoutSession(input: Readonly<{
  client:PrismaClient; attemptId:string; userId:string; customerId:string;
  amountUsdMinor:number; stripeSessionId:string;
}>):Promise<{recorded:boolean}> {
  const data=customIdentity(input);
  if (!SESSION.test(input.stripeSessionId)) refuse("AI_CREDIT_ATTEMPT_INVALID");
  const updated=await input.client.zoeBuildAiCreditCheckoutAttempt.updateMany({
    where:{...data,stripeSessionId:null},data:{stripeSessionId:input.stripeSessionId},
  });
  const found=await input.client.zoeBuildAiCreditCheckoutAttempt.findUnique({
    where:{attemptId:input.attemptId},
    select:{userId:true,priceId:true,customerId:true,stripeSessionId:true,
      amountUsdMinor:true,creditUnits:true,pricingVersion:true},
  });
  if (!found || found.userId!==data.userId || found.priceId!==data.priceId ||
      found.customerId!==data.customerId || found.amountUsdMinor!==data.amountUsdMinor ||
      found.creditUnits!==data.creditUnits || found.pricingVersion!==data.pricingVersion ||
      found.stripeSessionId!==input.stripeSessionId)
    refuse("AI_CREDIT_ATTEMPT_SESSION_CONFLICT");
  return {recorded:updated.count===1};
}
