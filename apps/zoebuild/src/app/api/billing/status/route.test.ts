import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks = vi.hoisted(() => ({access:vi.fn(),rows:vi.fn(),user:vi.fn(),live:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:mocks.access}));
vi.mock("@zoeskoul/platform-server/prisma",()=>({prisma:{user:{findUnique:mocks.user},subscription:{findMany:mocks.rows}}}));
vi.mock("@/lib/billing/platformStripeProvider",()=>({readBuilderStripeLifecycle:mocks.live}));
import {GET} from "./route";
const req = () => new Request("http://localhost:3003/api/billing/status");
describe("ZoeBuild platform billing status",()=>{
 beforeEach(()=>{vi.clearAllMocks(); process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS="price_builder";mocks.access.mockResolvedValue({userId:"self"});mocks.rows.mockResolvedValue([]);mocks.user.mockResolvedValue({stripeCustomerId:"cus_owner"});
  mocks.live.mockResolvedValue({subscriptionId:"sub_builder",status:"active",periodEnd:"2100-01-01T00:00:00Z",
    cancelAt:null,cancelAtPeriodEnd:false,nextBillingDate:null,nextBillingAmountMinor:null,nextBillingCurrency:null})});
 it("requires authenticated canonical identity",async()=>{mocks.access.mockResolvedValue({userId:null});expect((await GET(req())).status).toBe(401);expect(mocks.rows).not.toHaveBeenCalled()});
 it("filters to builder platform prices and does not expose Stripe IDs",async()=>{
  mocks.rows.mockResolvedValue([{stripeCustomerId:"cus_owner",stripeSubscriptionId:"sub_builder",billingProduct:"builder_ai",priceId:"price_builder",status:"active",trialEnd:null,currentPeriodEnd:new Date("2100-01-01"),cancelAtPeriodEnd:false}]);
  const result=await GET(req());expect(result.status).toBe(200);
  const body=await result.json();expect(body).toMatchObject({product:"builder_ai",subscribed:true});
  expect(JSON.stringify(body)).not.toContain("price_builder");
  expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({where:{userId:"self",priceId:{in:["price_builder"]}}}));
 });
  it("denies a foreign customer's active Builder row",async()=>{
    mocks.rows.mockResolvedValue([{stripeCustomerId:"cus_foreign",stripeSubscriptionId:"sub_builder",billingProduct:"builder_ai",priceId:"price_builder",status:"active",
      trialEnd:null,currentPeriodEnd:new Date("2100-01-01"),cancelAtPeriodEnd:false}]);
    const body=await (await GET(req())).json();
    expect(body).toMatchObject({product:"builder_ai",subscribed:false});
  });
  it("denies stale records when the user has no stored Stripe customer",async()=>{
    mocks.user.mockResolvedValue({stripeCustomerId:null});
    mocks.rows.mockResolvedValue([{stripeCustomerId:"cus_owner",stripeSubscriptionId:"sub_builder",billingProduct:"builder_ai",priceId:"price_builder",status:"active",
      trialEnd:null,currentPeriodEnd:new Date("2100-01-01"),cancelAtPeriodEnd:false}]);
    const body=await (await GET(req())).json();
    expect(body.subscribed).toBe(false);
  });
  it("fails closed if Stripe no longer reports the current Builder subscription",async()=>{
    mocks.rows.mockResolvedValue([{stripeCustomerId:"cus_owner",stripeSubscriptionId:"sub_builder",billingProduct:"builder_ai",
      priceId:"price_builder",status:"active",trialEnd:null,currentPeriodEnd:new Date("2100-01-01"),cancelAtPeriodEnd:false}]);
    mocks.live.mockResolvedValue(null);
    expect((await (await GET(req())).json()).subscribed).toBe(false);
  });

});
