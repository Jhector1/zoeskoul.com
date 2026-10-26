import { classifyPlatformCheckoutIntent, type PlatformCheckoutSessionEvidence } from "./platformCheckoutLifecycle";
import type { PlatformBillingCheckoutReservationResult } from "./platformCheckoutReservation";

/** Cross-product safe Checkout reservation preflight. Neither application can
 * silently replace another product's open Checkout. Only a provider-confirmed
 * expired session allows releasing the prior reservation. No test-mode paths.
 */
export type PlatformCheckoutGateResult =
  | Readonly<{kind:"ready"; reservedAt:Date}>
  | Readonly<{kind:"resume"; url:string}>
  | Readonly<{kind:"completed" | "conflict" | "stale" | "missing_user"}>;

export async function prepareReservedPlatformCheckout(input: Readonly<{
  userId:string;
  attemptId:string;
  priceId:string;
  useTrial:boolean;
  reserve:(userId:string,attemptId:string)=>Promise<PlatformBillingCheckoutReservationResult>;
  release:(userId:string,attemptId:string)=>Promise<boolean>;
  findSession:(userId:string,attemptId:string)=>Promise<PlatformCheckoutSessionEvidence|null>;
}>): Promise<PlatformCheckoutGateResult> {
  const {userId,attemptId}=input;
  let current=await input.reserve(userId,attemptId);
  if(current.kind==="conflict") {
    const previous=await input.findSession(userId,current.checkoutAttemptId);
    if(previous?.status==="complete")return {kind:"completed"};
    if(previous?.status==="open") {
      const intent=classifyPlatformCheckoutIntent({session:previous,priceId:input.priceId,useTrial:input.useTrial});
      if(intent==="match"&&previous.url)return {kind:"resume",url:previous.url};
      return {kind:"conflict"};
    }
    // A provider miss is not proof of expiration. Keep the reservation.
    if(previous?.status!=="expired")return {kind:"conflict"};
    await input.release(userId,current.checkoutAttemptId);
    current=await input.reserve(userId,attemptId);
  }
  if(current.kind==="reserved")return {kind:"ready",reservedAt:current.reservedAt};
  if(current.kind==="missing_user")return {kind:"missing_user"};
  if(current.kind==="conflict")return {kind:"conflict"};
  // Same attempt exceeded the retry TTL. Never create another Checkout.
  const previous=await input.findSession(userId,attemptId);
  if(previous?.status==="complete")return {kind:"completed"};
  if(previous?.status==="expired")await input.release(userId,attemptId);
  return {kind:"stale"};
}
