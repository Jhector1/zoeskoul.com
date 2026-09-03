
import { describe,expect,it,vi } from "vitest";vi.mock("server-only",()=>({}));
import { acceptLearningOrganizationInvite,learningOrganizationInviteState } from "./organizationInvites";
describe("LearningOrganization invitations",()=>{
 it("reuses invite lifecycle",()=>expect(learningOrganizationInviteState({expiresAt:"2026-09-04T00:00:00Z"},new Date("2026-09-03T00:00:00Z"))).toBe("pending"));
 it("creates school membership and only grants teacher globally",async()=>{const up=vi.fn(async()=>({})),uu=vi.fn(async()=>({})),iu=vi.fn(async()=>({}));const tx={learningOrganizationMember:{upsert:up},user:{update:uu},learningOrganizationInvite:{update:iu}};const prisma={learningOrganizationInvite:{findUnique:vi.fn(async()=>({id:"i",organizationId:"s",email:"t@example.com",role:"admin",expiresAt:new Date("2026-10-01"),acceptedAt:null,acceptedByUserId:null,revokedAt:null,organization:{id:"s",name:"School",slug:"school",owner:{id:"o",name:"O",email:"o@x.com"}}}))},user:{findUnique:vi.fn(async()=>({roles:["student"]}))},$transaction:vi.fn(async(fn:any)=>fn(tx))};const r=await acceptLearningOrganizationInvite(prisma as never,{token:"x",userId:"u",userEmail:"T@example.com"});expect(r.ok).toBe(true);expect(up).toHaveBeenCalled();expect(uu).toHaveBeenCalledWith({where:{id:"u"},data:{roles:{push:"teacher"}}});expect(JSON.stringify(uu.mock.calls)).not.toContain('"admin"');});
});
