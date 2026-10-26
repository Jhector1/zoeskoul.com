import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),read:vi.fn(),body:vi.fn(),checkout:vi.fn(),origin:vi.fn(),verified:vi.fn(),packs:vi.fn(),recovery:vi.fn(),fixedRecovery:vi.fn()}));
vi.mock("@/lib/billing/zoeBuildAiCreditCheckoutRecovery.server",()=>({verifyCustomCreditCheckoutForAuthenticatedUser:m.recovery,verifyFixedCreditCheckoutForAuthenticatedUser:m.fixedRecovery}));
vi.mock("@/lib/auth/buildHandoffProtocol",()=>({isServiceAuthorized:m.auth,isSha256:(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v),handoffBuilderOrigin:m.origin}));
vi.mock("@/lib/auth/buildHandoffBody",()=>({readLimitedHandoffJson:m.body}));
vi.mock("@/lib/auth/buildHandoffStore",()=>({readBuildHandoffSession:m.read}));
vi.mock("@/lib/billing/zoeBuildAiCreditStripeCheckout.server",()=>({createZoeBuildAiCreditCheckoutForAuthenticatedUser:m.checkout,verifiedZoeBuildAiCreditCatalog:m.verified}));
vi.mock("@/lib/billing/zoeBuildAiCreditStripeFunding",()=>({
  approvedZoeBuildCreditPacks:m.packs,
  validatedPackCatalog:vi.fn((packs:readonly {priceId:string}[])=>new Map(packs.map(p=>[p.priceId,p]))),
  ZoeBuildAiCreditFundingError:class ZoeBuildAiCreditFundingError extends Error{constructor(readonly code:string){super(code);}},
}));
import {POST} from "./route";
const req=()=>new Request("https://zoeskoul.com/api/billing/zoebuild-ai-credits",{method:"POST",headers:{authorization:"Bearer service"}});
const session={authenticated:true,user:{id:"u1"},roles:[],capabilities:[]};
const pack={priceId:"price_reviewed",amountUsdMinor:500,creditUnits:"500000"};
const checkout={action:"checkout",sessionHash:"b".repeat(64),priceId:pack.priceId,checkoutAttemptId:"zb-ai-123e4567-e89b-42d3-a456-426614174000"};
describe("V12J.20 Web-owned, Stripe-mode-bound AI credit authorization",()=>{
  beforeEach(()=>{vi.clearAllMocks();delete process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE;
    m.auth.mockReturnValue(true);m.read.mockResolvedValue(session);
    m.body.mockResolvedValue({action:"catalog",sessionHash:"a".repeat(64)});
    m.verified.mockResolvedValue([]);m.packs.mockReturnValue([]);m.origin.mockReturnValue("https://build.zoeskoul.com");
    m.recovery.mockResolvedValue({state:"unresolved"});m.fixedRecovery.mockResolvedValue({state:"unresolved"});
    m.checkout.mockResolvedValue({status:"open",url:"https://checkout.stripe.com/c/pay/cs_test_dummy",created:true});
  });
  it("rejects an unauthorized service caller before session lookup",async()=>{
    m.auth.mockReturnValue(false);expect((await POST(req())).status).toBe(401);expect(m.read).not.toHaveBeenCalled();
  });
  it("rejects revoked sessions before catalog or checkout",async()=>{
    m.read.mockResolvedValue({authenticated:false,user:null});expect((await POST(req())).status).toBe(401);
    expect(m.verified).not.toHaveBeenCalled();expect(m.checkout).not.toHaveBeenCalled();
  });
  it("remains off without a recognized funding mode",async()=>{
    const response=await POST(req());expect(await response.json()).toEqual({available:false,packs:[],mode:"off"});
    expect(m.verified).not.toHaveBeenCalled();
  });
  it.each(["sandbox-only","live"])("%s with empty approvals never exposes credit packs",async mode=>{
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE=mode;
    expect(await (await POST(req())).json()).toMatchObject({available:false,packs:[],mode});
    m.body.mockResolvedValue(checkout);
    expect((await POST(req())).status).toBe(409);
    expect(m.checkout).not.toHaveBeenCalled();
  });
  it.each(["sandbox-only","live"])("%s only displays Web-verified, reviewed Stripe prices",async mode=>{
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE=mode;
    m.packs.mockReturnValue([pack]);
    // A reviewed pack is not listed until current Stripe price verification succeeds.
    expect(await (await POST(req())).json()).toMatchObject({available:false,packs:[],mode});
    m.verified.mockResolvedValue([pack]);
    expect(await (await POST(req())).json()).toMatchObject({available:true,packs:[pack],mode});
  });
  it.each(["sandbox-only","live"])("%s delegates checkout using session-owned user and canonical origin",async mode=>{
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE=mode;m.packs.mockReturnValue([pack]);m.body.mockResolvedValue(checkout);
    const response=await POST(req());expect(await response.json()).toEqual({url:"https://checkout.stripe.com/c/pay/cs_test_dummy",resumed:false});
    expect(m.checkout).toHaveBeenCalledWith({authenticatedUserId:"u1",priceId:pack.priceId,
      checkoutAttemptId:checkout.checkoutAttemptId,appOrigin:"https://build.zoeskoul.com"});
  });
  it("authenticates and scopes recovery to the current session user",async()=>{
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE="sandbox-only";
    m.body.mockResolvedValue({action:"status",sessionHash:"a".repeat(64),purchaseKind:"custom",
      amountUsdMinor:725,checkoutAttemptId:checkout.checkoutAttemptId,userId:"forged"});
    m.recovery.mockResolvedValue({state:"open",url:"https://checkout.stripe.com/c/pay/safe"});
    expect(await (await POST(req())).json()).toEqual({state:"open",url:"https://checkout.stripe.com/c/pay/safe"});
    expect(m.recovery).toHaveBeenCalledWith({authenticatedUserId:"u1",amountUsdMinor:725,
      checkoutAttemptId:checkout.checkoutAttemptId,cancel:false});
  });
  it("refuses release until a fresh authoritative check confirms expired/unpaid",async()=>{
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE="sandbox-only";
    m.body.mockResolvedValue({action:"release",sessionHash:"a".repeat(64),purchaseKind:"custom",
      amountUsdMinor:725,checkoutAttemptId:checkout.checkoutAttemptId});
    m.recovery.mockResolvedValue({state:"completed"});
    expect((await POST(req())).status).toBe(409);
    m.recovery.mockResolvedValue({state:"expired_unpaid"});
    expect(await (await POST(req())).json()).toEqual({released:true});
  });
  it("releases verified funded purchase but not unfulfilled or disputed completion",async()=>{
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE="sandbox-only";
    m.body.mockResolvedValue({action:"release",sessionHash:"a".repeat(64),purchaseKind:"custom",
      amountUsdMinor:725,checkoutAttemptId:checkout.checkoutAttemptId});
    m.recovery.mockResolvedValue({state:"funded"});
    expect(await (await POST(req())).json()).toEqual({released:true});
    m.recovery.mockResolvedValue({state:"completed"});
    expect((await POST(req())).status).toBe(409);
  });
  it("authenticates old fixed-price sessions and never accepts browser ownership",async()=>{
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE="sandbox-only";
    m.body.mockResolvedValue({action:"status",sessionHash:"a".repeat(64),purchaseKind:"fixed",
      priceId:"price_old123",checkoutAttemptId:checkout.checkoutAttemptId,userId:"attacker"});
    m.fixedRecovery.mockResolvedValue({state:"expired_unpaid"});
    expect(await (await POST(req())).json()).toEqual({state:"expired_unpaid"});
    expect(m.fixedRecovery).toHaveBeenCalledWith({authenticatedUserId:"u1",priceId:"price_old123",checkoutAttemptId:checkout.checkoutAttemptId,cancel:false});
    expect(m.recovery).not.toHaveBeenCalled();
    m.body.mockResolvedValue({action:"release",sessionHash:"a".repeat(64),purchaseKind:"fixed",
      priceId:"price_old123",checkoutAttemptId:checkout.checkoutAttemptId});
    expect(await (await POST(req())).json()).toEqual({released:true});
    m.fixedRecovery.mockResolvedValue({state:"unresolved"});
    expect((await POST(req())).status).toBe(409);
  });
  it("scopes cancellation to the authenticated user and only confirms verified Stripe closure",async()=>{
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE="sandbox-only";
    m.body.mockResolvedValue({action:"cancel",sessionHash:"a".repeat(64),purchaseKind:"custom",
      amountUsdMinor:725,checkoutAttemptId:checkout.checkoutAttemptId,userId:"forged"});
    m.recovery.mockResolvedValue({state:"open"});
    expect((await POST(req())).status).toBe(409);
    expect(m.recovery).toHaveBeenCalledWith({authenticatedUserId:"u1",amountUsdMinor:725,
      checkoutAttemptId:checkout.checkoutAttemptId,cancel:true});
    m.recovery.mockResolvedValue({state:"expired_unpaid"});
    expect(await (await POST(req())).json()).toEqual({safeToRelease:true,wasFunded:false});
    m.recovery.mockResolvedValue({state:"funded"});
    expect(await (await POST(req())).json()).toEqual({safeToRelease:true,wasFunded:true});
  });
  it("fails closed with disabled funding, invalid request or revoked session",async()=>{
    m.body.mockResolvedValue({action:"status",sessionHash:"a".repeat(64),purchaseKind:"custom",
      amountUsdMinor:725,checkoutAttemptId:checkout.checkoutAttemptId});
    expect((await POST(req())).status).toBe(409);
    process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE="sandbox-only";
    m.body.mockResolvedValue({action:"status",sessionHash:"a".repeat(64),purchaseKind:"custom",
      amountUsdMinor:725,checkoutAttemptId:"bad"});
    expect((await POST(req())).status).toBe(400);
    expect(m.recovery).not.toHaveBeenCalled();
  });
  it("does not echo database/Stripe errors to the caller",async()=>{
    m.read.mockRejectedValue(new Error("SECRET-DB"));const r=await POST(req());expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("SECRET-DB");
  });
});
