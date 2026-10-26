import {describe,it,expect,vi,beforeEach} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),plans:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:m.auth}));
vi.mock("@/lib/billing/platformStripeProvider",()=>({listBuilderPlatformPlans:m.plans}));
import {GET} from "./route";
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({userId:"me"});m.plans.mockResolvedValue({configured:true,plans:[{priceId:"price_builder"}]});});
describe("ZoeBuild platform plans",()=>{
 it("does not call Stripe without authenticated identity",async()=>{m.auth.mockResolvedValue({userId:null});expect((await GET(new Request("https://zoebuild.test/api/billing/plans"))).status).toBe(401);expect(m.plans).not.toHaveBeenCalled();});
 it("only returns server-resolved builder prices",async()=>{const r=await GET(new Request("https://zoebuild.test/api/billing/plans"));expect(r.status).toBe(200);expect(await r.json()).toMatchObject({configured:true});});
 it("fails closed when pricing provider is unavailable",async()=>{m.plans.mockRejectedValue(Error("provider"));expect((await GET(new Request("https://zoebuild.test/api/billing/plans"))).status).toBe(503);});
});
