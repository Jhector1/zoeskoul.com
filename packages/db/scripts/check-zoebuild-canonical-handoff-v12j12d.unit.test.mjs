import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const start=readFileSync('apps/zoebuild/src/app/api/auth/handoff/start/route.ts','utf8');
const hook=readFileSync('apps/zoebuild/src/lib/auth/useBuilderSessionContinuity.ts','utf8');
const web=readFileSync('apps/web/src/app/api/auth/build-handoff/issue/route.ts','utf8');
test('canonical host chosen before verifier is minted and set in a cookie',()=>{
  assert.ok(start.indexOf('canonicalBuilderOrigin')<start.indexOf('const issuer'));
  assert.ok(start.indexOf('return relocated;')<start.indexOf('response.cookies.set(HANDOFF_COOKIE'));
  assert.match(start,/request.nextUrl.origin !== canonicalBuilderOrigin/);
});
test('canonicalization only redirects to fixed trusted Builder origin',()=>{
  assert.match(start,/new URL\(zoebuildOrigin\).origin/);
  assert.match(start,/new URL\("\/api\/auth\/handoff\/start", canonicalBuilderOrigin\)/);
  assert.match(start,/safeReturnPath\(request.nextUrl.searchParams.get\("returnTo"\)\)/);
});
test('Web callback remains server-owned and targeted to fixed configured origin',()=>{
  assert.match(web,/handoffBuilderOrigin\(\)/);
  assert.match(web,/new URL\("\/api\/auth\/handoff\/callback", handoffBuilderOrigin\(\)\)/);
});
test('error page never runs renewal loop',()=>{
  assert.match(hook,/window.location.pathname === "\/auth\/handoff\/error"/);
  assert.ok(hook.indexOf('window.location.pathname')<hook.indexOf('window.setInterval'));
});
test('no sensitive browser token storage, migration, or billing activation',()=>{
  for(const s of [start,hook]) assert.doesNotMatch(s,/localStorage\.|document.cookie|DATABASE_URL|STRIPE_SECRET|OPENAI_API_KEY|ALTER TABLE/);
});
