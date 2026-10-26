import {describe,it,expect,beforeEach,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),balance:vi.fn()}));
vi.mock("@/lib/access/currentUserAccess",()=>({getCurrentUserAccess:m.access}));
vi.mock("@/lib/http/appCors",()=>({
  isAppOriginAllowed:()=>true,
  appCorsJson:(_request:Request,payload:unknown,init?:{status?:number})=>Response.json(payload,{status:init?.status??200}),
  appCorsPreflight:()=>new Response(null,{status:204}),
}));
vi.mock("@/lib/tutoring/tutoringCommercial",()=>({getTutoringCreditBalance:m.balance}));
vi.mock("@/lib/tutoring/tutoringCreditPackages",()=>({launchTutoringCreditPackagePresentation:()=>[]}));
vi.mock("@/lib/tutoring/tutoringPricing",()=>({tutoringPricingPresentation:()=>({})}));
import {GET} from "./route";
const request=()=>new Request("https://web.test/api/tutoring/credits");
beforeEach(()=>{
  vi.clearAllMocks();
  m.access.mockResolvedValue({authenticated:true,user:{id:"learner_1"},capabilities:{accessStudentApp:true}});
  m.balance.mockResolvedValue({availableMinutes:60,reservedMinutes:30,totalMinutes:90});
});
describe("student tutoring credit protocol",()=>{
  it("returns a domain-identified integer-minute balance, never Builder AI units",async()=>{
    const response=await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({creditDomain:"tutoring_minutes",
      balance:{availableMinutes:60,reservedMinutes:30,totalMinutes:90}});
    expect(m.balance).toHaveBeenCalledWith("learner_1");
  });
  it("rejects unauthorized users without reading a tutoring balance",async()=>{
    m.access.mockResolvedValue({authenticated:false,user:null,capabilities:{accessStudentApp:false}});
    expect((await GET(request())).status).toBe(401);
    expect(m.balance).not.toHaveBeenCalled();
  });
});
