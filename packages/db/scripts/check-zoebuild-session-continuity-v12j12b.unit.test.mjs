import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root=new URL("../../../",import.meta.url);
const read=p=>readFileSync(new URL(p,root),"utf8");
const web=read("apps/web/src/lib/auth/buildHandoffStore.ts");
const protocol=read("apps/web/src/lib/auth/buildHandoffProtocol.ts");
const builder=read("apps/zoebuild/src/lib/auth/buildHandoff.ts");
const renew=read("apps/zoebuild/src/app/api/auth/handoff/renew/route.ts");
const route=read("apps/web/src/app/api/auth/build-handoff/renew/route.ts");
const hook=read("apps/zoebuild/src/lib/auth/useBuilderSessionContinuity.ts");
const header=read("apps/zoebuild/src/components/chrome/ZoeBuildHeader.tsx");
const shell=read("apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
test("Web Redis and Builder HttpOnly cookie share 24h inactivity policy",()=>{
  assert.match(protocol,/BUILD_SESSION_SECONDS = 24 \* 60 \* 60/);
  assert.match(builder,/SESSION_SECONDS = 24 \* 60 \* 60/);
  assert.match(renew,/httpOnly: true, secure: true, sameSite: "lax", path: "\/"/);
});
test("renewal checks epoch/index atomically and never recreates a revoked session",()=>{
  assert.match(web,/redis\.eval\(/);
  assert.match(web,/redis\.call\('SISMEMBER'/);
  assert.match(web,/redis\.call\('EXPIRE'/);
  assert.match(web,/redis\.call\('GET'/);
  assert.match(web,/readBuildHandoffSession\(sessionHash\)/);
  assert.doesNotMatch(web.slice(web.indexOf('export async function renewBuildHandoffSession')),/redis\.set\(|issueBuildHandoff\(/);
});
test("session renewal stays server-to-server, bounded and service-authenticated",()=>{
  assert.match(route,/isServiceAuthorized/);
  assert.match(route,/readLimitedHandoffJson\(request, 512\)/);
  assert.match(builder,/websiteServicePost\("\/api\/auth\/build-handoff\/renew"/);
  assert.doesNotMatch(route,/NextResponse\.redirect|provider|sessionToken/);
});
test("cookie only renews after verified central authorization and same-origin POST",()=>{
  assert.match(renew,/enforceSameOriginPost\(request\)/);
  assert.ok(renew.indexOf('const result = await renewBuilderSession') < renew.indexOf('response.cookies.set(SESSION_COOKIE'));
  assert.match(renew,/result.kind === "unavailable"/);
  assert.match(renew,/result.kind === "expired"/);
  assert.match(renew,/response\.cookies\.set\(SESSION_COOKIE/);
});
test("visible browser heartbeat never reloads, redirects or stores login tokens",()=>{
  assert.match(hook,/visibilitychange/);assert.match(hook,/"focus"/);
  assert.match(hook,/SESSION_RENEW_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(hook,/credentials: "same-origin"/);
  assert.doesNotMatch(hook,/location\.reload|location\.assign|localStorage|sessionStorage/);
  assert.match(header,/useBuilderSessionContinuity\(\)/);
});
test("expiry gives editor a reconnect action without mutating source or billing identity",()=>{
  assert.match(shell,/Reconnect Zoéskoul session/);
  assert.match(shell,/ZOEBUILD_SESSION_EXPIRED_EVENT/);
  assert.doesNotMatch(renew,/grantAiCredit|settleAiCredits|Stripe/);
});
test("logout remains centrally revocable",()=>{
  const logout=read("apps/web/src/app/api/auth/logout/route.ts");
  assert.match(logout,/revokeUserBuildSessions\(userId\)/);
  assert.match(web,/EPOCH_PREFIX/);
});
