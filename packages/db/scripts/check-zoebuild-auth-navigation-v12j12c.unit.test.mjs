import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../../',import.meta.url);
const src=(p)=>readFileSync(new URL(p,root),'utf8');
const page=src('apps/zoebuild/src/app/auth/handoff/error/page.tsx');
const header=src('apps/zoebuild/src/components/chrome/ZoeBuildHeader.tsx');
const editor=src('apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx');
const start=src('apps/zoebuild/src/app/api/auth/handoff/start/route.ts');
const probe=src('packages/db/scripts/probe-zoebuild-handoff-v12j12c.mjs');
test('retry sign-in uses native document navigation to the redirecting handoff route',()=>{
 assert.match(page,/<a[\s\S]*?href="\/api\/auth\/handoff\/start\?returnTo=%2Fen%2Fprojects"[\s\S]*?Retry sign-in[\s\S]*?<\/a>/);
 assert.doesNotMatch(page,/<Link[\s\S]*?href="\/api\/auth\/handoff\/start\?returnTo=/);
});
test('header sign-in uses a native anchor, avoiding Next RSC cross-origin redirect',()=>{
 assert.match(header,/<a[\s\S]*?href=\{signInHref\}[\s\S]*?\{t\.signIn\}[\s\S]*?<\/a>/);
 assert.doesNotMatch(header,/<Link\s+className="ui-btn-secondary h-8"/);
});
test('editor reconnect uses native navigation and keeps project return path',()=>{
 assert.match(editor,/<a[\s\S]*?href=\{`\/api\/auth\/handoff\/start\?returnTo=\$\{encodeURIComponent\(/);
 assert.match(editor,/Reconnect Zoéskoul session[\s\S]*?<\/a>/);
 assert.doesNotMatch(editor,/<Link\s+className="zb-project-assistant-apply"/);
});
test('handoff still only uses trusted Web origin and one-time verification',()=>{
 assert.match(start,/requireHandoffOrigins\(\)/);
 assert.match(start,/randomOpaque\(\)/);
 assert.match(start,/const state = sha256\(verifier\)/);
 assert.match(start,/NextResponse\.redirect\(login, 303\)/);
 assert.match(start,/httpOnly: true, secure: true/);
});
test('diagnostic only targets fixed local origins and random unallocated session',()=>{
 assert.match(probe,/const WEB='http:\/\/localhost:3000'/);
 assert.match(probe,/const BUILD='http:\/\/localhost:3004'/);
 assert.match(probe,/randomBytes\(32\)\.toString\('hex'\)/);
 assert.match(probe,/redirect:'manual'/);
 assert.doesNotMatch(probe,/set-cookie|console\.(?:log|error)\(.*secret|\.env\.shared\.local|DATABASE_URL|\/api\/auth\/build-handoff\/issue/);
});
test('diagnostic distinguishes server-to-server auth failure, Redis failure and stale Web route',()=>{
 for(const s of ['SERVICE_AUTH_MISMATCH','AUTHORITY_OR_REDIS_UNAVAILABLE','WEB_ROUTE_NOT_RUNNING','BUILDER_START_REDIRECT_TARGET_MISMATCH'])assert.ok(probe.includes(s));
});
