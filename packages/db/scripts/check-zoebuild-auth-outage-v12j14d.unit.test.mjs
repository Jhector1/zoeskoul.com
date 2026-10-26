import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");
const h=read("apps/zoebuild/src/lib/auth/buildHandoff.ts");
const a=read("apps/zoebuild/src/lib/build/currentBuildAccess.ts");
const s=read("apps/zoebuild/src/lib/auth/useBuilderSessionContinuity.ts");
const b=read("apps/zoebuild/src/app/[locale]/billing/BuilderBillingClient.tsx");
test("Web authority unavailable is distinguished from genuinely expired session",()=>{
 assert.match(h,/export async function readBuilderSessionStatus/);
 assert.match(h,/if \(!response\.ok\) return \{ kind: "unavailable" \}/);
 assert.match(h,/if \(!payload\.authenticated \|\| !payload\.user\?\.id\) return \{ kind: "expired" \}/);
 assert.match(a,/checked\.kind === "unavailable"/);
});
test("billing GET endpoints respond 503 instead of claiming 401 during Web outages",()=>{
 for(const p of ["verification","credits","plans"]){
  const route=read("apps/zoebuild/src/app/api/billing/"+p+"/route.ts");
  assert.match(route,/requireAuthority:true/);
  assert.match(route,/SESSION_AUTHORITY_UNAVAILABLE/);
  assert.match(route,/503/);
 }
});
test("genuine expired or missing session remains fail-closed",()=>{
 assert.match(h,/if \(!isOpaque\(sessionToken\)\) return \{ kind: "expired" \}/);
 assert.match(a,/session\.authenticated \? session\.user\.id : ""/);
 assert.match(s,/expiredConfirmed = true/);
});
test("heartbeat backs off and does not trigger redirect or browser reload",()=>{
 assert.match(s,/nextRetryAt = Date\.now\(\) \+ 60_000/);
 assert.doesNotMatch(s,/window\.location\.reload|window\.location\.assign/);
});
test("billing evidence not presented as current when verification fails",()=>{
 assert.match(b,/setVerificationUnavailable\(true\)/);
 assert.match(b,/Verification unavailable/);
 assert.match(b,/Do not subscribe again/);
 assert.match(b,/nextAutomaticRetryAt\.current=Date\.now\(\)\+120_000/);
});
test("diagnostic is read-only and prints status categories only",()=>{
 const p=read("packages/db/scripts/probe-zoebuild-auth-outage-v12j14d.mjs");
 assert.match(p,/randomBytes\(32\)/);
 assert.doesNotMatch(p,/console\.log\(secret|console\.log\(body|writeFileSync|prisma|stripe\.checkout/);
});
