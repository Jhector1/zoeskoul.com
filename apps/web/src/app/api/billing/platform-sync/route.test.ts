import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),sync:vi.fn(),user:vi.fn(),subs:vi.fn(),grants:vi.fn()}));
vi.mock("@/lib/auth",()=>({auth:m.auth}));
vi.mock("@/lib/billing/stripeService",()=>({syncSubscriptionsForUser:m.sync}));
vi.mock("@/lib/prisma",()=>({prisma:{user:{findUnique:m.user},subscription:{findMany:m.subs},featureGrant:{findMany:m.grants}}}));
import {GET} from "./route";

const activeRow=()=>({stripeCustomerId:"cus_owner",priceId:"price_builder",billingProduct:"builder_ai",
  status:"active",currentPeriodEnd:new Date("2100-01-01T00:00:00Z"),trialEnd:null,cancelAtPeriodEnd:false});
const grant=(feature:string)=>({feature,startsAt:null,endsAt:new Date("2100-01-01T00:00:00Z")});

beforeEach(()=>{
  vi.clearAllMocks();
  process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS="price_builder";
  process.env.ZOEBUILD_AI_STRIPE_PRODUCT_IDS="prod_builder";
  // The absence of Learning plan presentation must not disable this sync.
  delete process.env.STRIPE_PRICE_MONTHLY_ID;
  delete process.env.STRIPE_PRICE_YEARLY_ID;
  delete process.env.AUTH_URL;
  m.auth.mockResolvedValue({user:{id:"self"}});
  m.sync.mockResolvedValue(undefined);
  m.user.mockResolvedValue({stripeCustomerId:"cus_owner"});
  m.subs.mockResolvedValue([activeRow()]);
  m.grants.mockResolvedValue([grant("build_ai_generate"),grant("build_ai_edit")]);
});

describe("authenticated canonical Stripe synchronization independent of Learning prices",()=>{
  it("syncs the signed-in user even without Learning monthly/yearly and AUTH_URL",async()=>{
    const response=await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(m.sync).toHaveBeenCalledOnce();
    expect(m.sync).toHaveBeenCalledWith("self");
    expect(await response.json()).toMatchObject({stripeSynchronized:true,builderProductConfigured:true,
      builderSubscriptionActive:true,builderGenerateGrant:true,builderEditGrant:true});
  });
  it("requires authentication before any Stripe or database calls",async()=>{
    m.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(m.sync).not.toHaveBeenCalled();
    expect(m.subs).not.toHaveBeenCalled();
  });
  it("fails closed when Stripe synchronization fails",async()=>{
    m.sync.mockRejectedValue(new Error("Stripe unavailable"));
    const response=await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).stripeSynchronized).toBeUndefined();
    expect(m.subs).not.toHaveBeenCalled();
  });
  it("does not count the same price as Builder when its DB product is Learning",async()=>{
    m.subs.mockResolvedValue([{...activeRow(),billingProduct:"learning"}]);
    const body=await (await GET()).json();
    expect(body.builderSubscriptionActive).toBe(false);
    expect(body.builderGenerateGrant).toBe(false);
    expect(body.builderEditGrant).toBe(false);
  });
  it("does not borrow subscriptions from other Stripe customers",async()=>{
    m.subs.mockResolvedValue([{...activeRow(),stripeCustomerId:"cus_foreign"}]);
    expect((await (await GET()).json()).builderSubscriptionActive).toBe(false);
  });
  it("denies terminal canceled subscriptions even with future period ends",async()=>{
    m.subs.mockResolvedValue([{...activeRow(),status:"canceled"}]);
    const body=await (await GET()).json();
    expect(body.builderSubscriptionActive).toBe(false);
    expect(body.builderGenerateGrant).toBe(false);
  });
  it("does not report Builder activation without independent Product ID configuration",async()=>{
    delete process.env.ZOEBUILD_AI_STRIPE_PRODUCT_IDS;
    const body=await (await GET()).json();
    expect(body).toMatchObject({builderProductConfigured:false,builderSubscriptionActive:false,
      builderGenerateGrant:false,builderEditGrant:false});
  });
});
