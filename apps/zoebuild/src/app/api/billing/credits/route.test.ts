import {beforeEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),balance:vi.fn(),activity:vi.fn(),wallet:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:m.access}));
vi.mock("@zoeskoul/platform-server/ai-credits/ledger",()=>({getAiCreditBalance:m.balance}));
vi.mock("@zoeskoul/platform-server/prisma",()=>({prisma:{
  aiCreditLedgerEntry:{findMany:m.activity},aiCreditWallet:{findUnique:m.wallet},
}}));
import {GET} from "./route";
const request=()=>new Request("https://zoebuild.test/api/billing/credits");
beforeEach(()=>{
  vi.clearAllMocks();delete process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT;
  m.access.mockResolvedValue({userId:"self",entitlements:[]});
  m.balance.mockResolvedValue({subscriptionAvailableUnits:"1500",purchasedAvailableUnits:"200",reservedUnits:"50"});
  m.activity.mockResolvedValue([{kind:"consume",availableDelta:-30n,reservedDelta:-30n,createdAt:new Date("2026-10-22T12:00:00Z")}]);
  m.wallet.mockResolvedValue({riskFrozenAt:null});
});
describe("user credit ledger read only",()=>{
  it("rejects unauthenticated access before any wallet query",async()=>{
    m.access.mockResolvedValue({userId:null,entitlements:[]});expect((await GET(request())).status).toBe(401);
    expect(m.balance).not.toHaveBeenCalled();expect(m.activity).not.toHaveBeenCalled();
  });
  it("scopes every query to the authenticated user",async()=>{
    const response=await GET(request());expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(m.balance).toHaveBeenCalledWith(expect.objectContaining({userId:"self"}));
    expect(m.activity).toHaveBeenCalledWith(expect.objectContaining({where:{userId:"self"},take:12}));
    expect(m.wallet).toHaveBeenCalledWith(expect.objectContaining({where:{userId:"self"}}));
  });
  it("returns exact ledger units as strings without inventing top-up prices",async()=>{
    const body=await (await GET(request())).json();
    expect(body).toMatchObject({unit:"ledger_unit",creditDomain:"zoebuild_ai_units",subscriptionAvailableUnits:"1500",
      purchasedAvailableUnits:"200",reservedUnits:"50",creditTopUpsAvailable:false,meteringStatus:"not_activated"});
    expect(body.activity[0]).toMatchObject({availableDeltaUnits:"-30",reservedDeltaUnits:"-30"});
    expect(JSON.stringify(body)).not.toContain("self");
  });
  it("reports canonical separate editing and generation grants, never a paid status",async()=>{
    const initial=await (await GET(request())).json();
    expect(initial.aiAccess).toEqual({canGenerateWithAi:false,canEditWithAi:false});
    expect(initial.billingReviews).toEqual({modelProfilesRegistered:false,operationalApprovalsRegistered:false});
    m.access.mockResolvedValue({userId:"self",entitlements:["build_ai_edit"]});
    const editOnly=await (await GET(request())).json();
    expect(editOnly.aiAccess).toEqual({canGenerateWithAi:false,canEditWithAi:true});
    m.access.mockResolvedValue({userId:"self",entitlements:["build_ai_generate"]});
    const generateOnly=await (await GET(request())).json();
    expect(generateOnly.aiAccess).toEqual({canGenerateWithAi:true,canEditWithAi:false});
  });
  it("does not imply route activation from an existing grant",async()=>{
    m.access.mockResolvedValue({userId:"self",entitlements:["build_ai_generate","build_ai_edit"]});
    process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT="required";
    const body=await (await GET(request())).json();
    expect(body.aiAccess).toEqual({canGenerateWithAi:true,canEditWithAi:true});
    expect(body.meteringStatus).toBe("activation_incomplete");
    expect(body.billingReviews.operationalApprovalsRegistered).toBe(false);
    expect(body.creditTopUpsAvailable).toBe(false);
  });
  it("does not claim production-ready metering if enforcement requested",async()=>{
    process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT="required";
    expect((await (await GET(request())).json()).meteringStatus).toBe("activation_incomplete");
  });
  it("reports wallet freeze but does not expose personal identifiers",async()=>{
    m.wallet.mockResolvedValue({riskFrozenAt:new Date()});
    expect((await (await GET(request())).json()).walletFrozen).toBe(true);
  });
  it("fails closed on ledger errors",async()=>{
    m.balance.mockRejectedValue(new Error("DB unavailable"));
    const response=await GET(request());expect(response.status).toBe(503);
    expect((await response.json()).subscriptionAvailableUnits).toBeUndefined();
  });
});
