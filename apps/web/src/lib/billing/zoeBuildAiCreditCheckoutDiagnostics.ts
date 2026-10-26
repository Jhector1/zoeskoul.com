/** Diagnostic-only audit for Stripe checkout recovery and explicit cancellation.
 * Covers read operations and explicit Stripe session expiry.
 * Never write exception.message, stack, request data, IDs, URLs, or env variables. */
export type RecoveryReadStage =
  | "attempt" | "customer" | "stripe-session" | "stripe-history"
  | "line-items" | "grant-ledger" | "stripe-expire" | "web-route";

type SafeCategory = "prisma" | "stripe-auth" | "stripe-network" |
  "stripe-rate-limit" | "stripe-request" | "stripe-other" |
  "network" | "unclassified";
const PRISMA_CODE=/^P[0-9]{4}$/;
const KNOWN_NETWORK = new Set(["ECONNREFUSED","ECONNRESET","ETIMEDOUT","ENOTFOUND","EAI_AGAIN"]);
function record(error:unknown):Record<string,unknown>{
  return error && typeof error==="object" ? error as Record<string,unknown> : {};
}
export function classifyCheckoutRecoveryError(error:unknown):Readonly<{category:SafeCategory;code?:string}>{
  const e=record(error);
  if(typeof e.code==="string" && PRISMA_CODE.test(e.code))
    return {category:"prisma",code:e.code};
  const type=typeof e.type==="string"?e.type:typeof e.name==="string"?e.name:"";
  if(type==="StripeAuthenticationError")return {category:"stripe-auth"};
  if(type==="StripeConnectionError"||type==="StripeAPIConnectionError")return {category:"stripe-network"};
  if(type==="StripeRateLimitError")return {category:"stripe-rate-limit"};
  if(type==="StripeInvalidRequestError")return {category:"stripe-request"};
  if(type.startsWith("Stripe") && /^[A-Za-z]+$/.test(type))return {category:"stripe-other"};
  if(typeof e.code==="string" && KNOWN_NETWORK.has(e.code))return {category:"network"};
  return {category:"unclassified"};
}
export function reportCheckoutRecoveryFailure(stage:RecoveryReadStage,error:unknown):void{
  const safe=classifyCheckoutRecoveryError(error);
  // Emit only enumerated fields: no account identifiers or exception contents.
  console.error("ZB_CHECKOUT_RECOVERY_READ_FAILURE",{stage,...safe});
}
export async function withCheckoutRecoveryAudit<T>(stage:RecoveryReadStage,read:()=>Promise<T>):Promise<T>{
  try{return await read();}
  catch(error){reportCheckoutRecoveryFailure(stage,error);throw error;}
}
