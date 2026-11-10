import crypto from "node:crypto";
import { describe, it, expect, afterEach } from "vitest";
import { verifyAdminGrant, assertVerifiedAdminGrant } from "./learningAdminGrant.js";

const vars = ["ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED", "ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET", "ZOESKOUL_LEARNING_ADMIN_LAB_IMAGE", "RUNNER_EXECUTION_POOL"] as const;
const originals = Object.fromEntries(vars.map(v=>[v,process.env[v]]));
afterEach(()=> { for(const key of vars) {
  if(originals[key]===undefined) delete process.env[key]; else process.env[key]=originals[key];
} });
function configure() {
 process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED="true";
 process.env.ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET="q".repeat(64);
 process.env.ZOESKOUL_LEARNING_ADMIN_LAB_IMAGE="sha256:"+"a".repeat(64);
 process.env.RUNNER_EXECUTION_POOL="zoeskoul-learning";
}
function issue(actorKey="actor1", topicSlug="sudo-root-concepts", nonce=crypto.randomBytes(16).toString("hex")) {
 const iat = Math.floor(Date.now()/1000);
 const claims={v:1,aud:"zoeskoul-learning-admin",actorKey,courseSlug:"linux-files-permissions-users",topicSlug,iat,exp:iat+45,nonce};
 const payload=Buffer.from(JSON.stringify(claims)).toString("base64url");
 const signature=crypto.createHmac("sha256",process.env.ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET!).update(payload).digest("base64url");
 return `${payload}.${signature}`;
}
describe("admin lab admission",()=>{
 it("fails closed when operator switch is OFF",()=>{configure();delete process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED;expect(()=>verifyAdminGrant(issue(),"actor1")).toThrow(/disabled/)});
 it("requires the dedicated pool and pinned image",()=>{configure();process.env.RUNNER_EXECUTION_POOL="zoebuild";expect(()=>verifyAdminGrant(issue(),"actor1")).toThrow(/dedicated/);configure();process.env.ZOESKOUL_LEARNING_ADMIN_LAB_IMAGE="latest";expect(()=>verifyAdminGrant(issue(),"actor1")).toThrow(/configured/)});
 it("accepts actor-bound one-time grants",()=>{configure();const g=verifyAdminGrant(issue(),"actor1");expect(g.topicSlug).toBe("sudo-root-concepts");expect(()=>assertVerifiedAdminGrant(g,"actor1")).not.toThrow();expect(()=>assertVerifiedAdminGrant(g,"other")).toThrow()});
 it("rejects actor spoofing and replay",()=>{configure();const token=issue();expect(()=>verifyAdminGrant(token,"other")).toThrow();verifyAdminGrant(token,"actor1");expect(()=>verifyAdminGrant(token,"actor1")).toThrow(/used/)});
 it("rejects unsupported lessons and forged signatures",()=>{configure();expect(()=>verifyAdminGrant(issue("actor1","other-topic"),"actor1")).toThrow();const token=issue();expect(()=>verifyAdminGrant(token.slice(0,-3)+"xxx","actor1")).toThrow()});
});
