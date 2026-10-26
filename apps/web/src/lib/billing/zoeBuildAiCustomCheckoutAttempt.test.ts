import {describe,it,expect,vi} from "vitest";
import type {PrismaClient} from "@zoeskoul/db";
import {claimZoeBuildCustomCheckoutAttempt,recordZoeBuildCustomCheckoutSession} from "./zoeBuildAiCreditCheckoutAttempt";
import {ZOE_CUSTOM_TOPUP_MARKER,ZOE_TOP_UP_POLICY} from "@zoeskoul/platform-server/ai-credits/customCreditTopUp";
const attemptId="zb-ai-123e4567-e89b-42d3-a456-426614174000";
function fake() {
  let row:null|{attemptId:string;userId:string;customerId:string;priceId:string;
    amountUsdMinor:number;creditUnits:bigint;pricingVersion:string;stripeSessionId:string|null}=null;
  const client={zoeBuildAiCreditCheckoutAttempt:{
    createMany:vi.fn(async({data}:{data:NonNullable<typeof row>[]})=>{
      if(row)return {count:0};row={...data[0]!,stripeSessionId:null};return {count:1};
    }),
    findUnique:vi.fn(async()=>row),
    updateMany:vi.fn(async({where,data}:{where:NonNullable<typeof row>;
      data:{stripeSessionId:string}})=>{
      if(!row || row.attemptId!==where.attemptId || row.userId!==where.userId ||
          row.customerId!==where.customerId || row.priceId!==where.priceId ||
          row.amountUsdMinor!==where.amountUsdMinor || row.creditUnits!==where.creditUnits ||
          row.pricingVersion!==where.pricingVersion || row.stripeSessionId!==null)return {count:0};
      row={...row,stripeSessionId:data.stripeSessionId};return {count:1};
    }),
  }} as unknown as PrismaClient;
  return {client,get:()=>row};
}
const input=(client:PrismaClient)=>({client,attemptId,userId:"user-123",
  customerId:"cus_123",amountUsdMinor:1725});
describe("V12J.28C immutable custom amount claim",()=>{
  it("stores integer cents, ledger units and reviewed policy version",async()=>{
    const f=fake();expect(await claimZoeBuildCustomCheckoutAttempt(input(f.client)))
      .toEqual({claimed:true,stripeSessionId:null});
    expect(f.get()).toMatchObject({priceId:ZOE_CUSTOM_TOPUP_MARKER,amountUsdMinor:1725,
      creditUnits:1725000n,pricingVersion:ZOE_TOP_UP_POLICY.version});
    expect(await claimZoeBuildCustomCheckoutAttempt(input(f.client)))
      .toEqual({claimed:false,stripeSessionId:null});
  });
  it("refuses amount or owner changes for the same attempt",async()=>{
    const f=fake();await claimZoeBuildCustomCheckoutAttempt(input(f.client));
    for(const patch of [{amountUsdMinor:1800},{userId:"other"},{customerId:"cus_other"}])
      await expect(claimZoeBuildCustomCheckoutAttempt({...input(f.client),...patch}))
        .rejects.toThrow("AI_CREDIT_ATTEMPT_OWNERSHIP_CONFLICT");
  });
  it("binds one session and refuses replacements",async()=>{
    const f=fake();await claimZoeBuildCustomCheckoutAttempt(input(f.client));
    const args={...input(f.client),stripeSessionId:"cs_test_123"};
    expect(await recordZoeBuildCustomCheckoutSession(args)).toEqual({recorded:true});
    expect(await recordZoeBuildCustomCheckoutSession(args)).toEqual({recorded:false});
    expect((await claimZoeBuildCustomCheckoutAttempt(input(f.client))).stripeSessionId).toBe("cs_test_123");
    await expect(recordZoeBuildCustomCheckoutSession({...args,stripeSessionId:"cs_test_other"}))
      .rejects.toThrow("AI_CREDIT_ATTEMPT_SESSION_CONFLICT");
  });
  it("rejects malformed amounts and live session IDs before DB writes",async()=>{
    const f=fake();
    for(const amountUsdMinor of [499,50001,500.1,NaN])
      await expect(claimZoeBuildCustomCheckoutAttempt({...input(f.client),amountUsdMinor}))
        .rejects.toThrow("AI_CREDIT_TOPUP_AMOUNT_INVALID");
    await expect(recordZoeBuildCustomCheckoutSession({...input(f.client),stripeSessionId:"cs_live_wrong"}))
      .rejects.toThrow("AI_CREDIT_ATTEMPT_INVALID");
    expect(f.get()).toBeNull();
  });
});
