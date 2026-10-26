import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@zoeskoul/db";
import {claimZoeBuildAiCreditCheckoutAttempt,recordZoeBuildAiCreditCheckoutSession}
  from "./zoeBuildAiCreditCheckoutAttempt";
const attemptId = "zb-ai-123e4567-e89b-12d3-a456-426614174000";
function fake() {
  let row: null | {attemptId:string;userId:string;priceId:string;customerId:string;
    stripeSessionId:string|null} = null;
  const client = {zoeBuildAiCreditCheckoutAttempt: {
    createMany: vi.fn(async ({data}:{data: Array<Omit<NonNullable<typeof row>,"stripeSessionId">>}) => {
      if(row) return {count:0};row={...data[0]!,stripeSessionId:null};return {count:1};
    }),
    findUnique: vi.fn(async () => row),
    updateMany: vi.fn(async ({where,data}:{where:{userId:string;customerId:string;
      priceId:string;attemptId:string;stripeSessionId:null};data:{stripeSessionId:string}}) => {
      if(!row||row.attemptId!==where.attemptId||row.userId!==where.userId||
          row.priceId!==where.priceId||row.customerId!==where.customerId||row.stripeSessionId!==null)
        return {count:0};
      row={...row,stripeSessionId:data.stripeSessionId};return {count:1};
    }),
  }} as unknown as PrismaClient;
  return {client,getRow:()=>row};
}
const data=(client:PrismaClient)=>({client,attemptId,userId:"user-123",priceId:"price_123",
  customerId:"cus_123"});
const saved=(client:PrismaClient)=>({...data(client),stripeSessionId:"cs_test_123"});
describe("E16C5A2B durable Checkout attempt identity (no charge/grant)",()=>{
  it("claims once and reads back the same owner on replay",async()=>{
    const {client}=fake();
    expect(await claimZoeBuildAiCreditCheckoutAttempt(data(client))).toEqual({claimed:true,stripeSessionId:null});
    expect(await claimZoeBuildAiCreditCheckoutAttempt(data(client))).toEqual({claimed:false,stripeSessionId:null});
  });
  it("refuses reuse by a different user, price or customer",async()=>{
    const {client}=fake();await claimZoeBuildAiCreditCheckoutAttempt(data(client));
    for(const patch of [{userId:"other-user"},{priceId:"price_other"},{customerId:"cus_other"}])
      await expect(claimZoeBuildAiCreditCheckoutAttempt({...data(client),...patch}))
        .rejects.toThrow("AI_CREDIT_ATTEMPT_OWNERSHIP_CONFLICT");
  });
  it("persists one immutable Stripe session and allows matching replay",async()=>{
    const {client,getRow}=fake();await claimZoeBuildAiCreditCheckoutAttempt(data(client));
    expect(await recordZoeBuildAiCreditCheckoutSession(saved(client))).toEqual({recorded:true});
    expect(await recordZoeBuildAiCreditCheckoutSession(saved(client))).toEqual({recorded:false});
    expect(getRow()?.stripeSessionId).toBe("cs_test_123");
    expect(await claimZoeBuildAiCreditCheckoutAttempt(data(client))).toEqual({claimed:false,stripeSessionId:"cs_test_123"});
  });
  it("blocks session replacement and mismatched ownership",async()=>{
    const {client}=fake();await claimZoeBuildAiCreditCheckoutAttempt(data(client));
    await recordZoeBuildAiCreditCheckoutSession(saved(client));
    await expect(recordZoeBuildAiCreditCheckoutSession({...saved(client),stripeSessionId:"cs_test_different"}))
      .rejects.toThrow("AI_CREDIT_ATTEMPT_SESSION_CONFLICT");
    await expect(recordZoeBuildAiCreditCheckoutSession({...saved(client),userId:"forged"}))
      .rejects.toThrow("AI_CREDIT_ATTEMPT_SESSION_CONFLICT");
  });
  it("rejects malformed attempt and live session IDs before DB mutation",async()=>{
    const {client}=fake();
    await expect(claimZoeBuildAiCreditCheckoutAttempt({...data(client),attemptId:"bad"}))
      .rejects.toThrow("AI_CREDIT_ATTEMPT_INVALID");
    await expect(recordZoeBuildAiCreditCheckoutSession({...saved(client),stripeSessionId:"cs_live_wrong"}))
      .rejects.toThrow("AI_CREDIT_ATTEMPT_INVALID");
  });
});
