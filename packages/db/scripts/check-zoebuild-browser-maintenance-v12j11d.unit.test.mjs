import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const workflow=read('.github/workflows/zoebuild-ai-result-retention.yml');
const endpoint=read('apps/zoebuild/src/app/api/internal/ai-result-retention/route.ts');
const routeTest=read('apps/zoebuild/src/app/api/internal/ai-result-retention/route.test.ts');
const browser=read('apps/web/tests/e2e/zoebuild/ai-attempt-retry-refresh.spec.ts');
const shell=read('apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx');
const id=read('apps/zoebuild/src/lib/build/aiBillingOperationIdentity.ts');
const recovery=read('apps/zoebuild/src/lib/build/aiBrowserAttemptRecovery.ts');
const retention=read('apps/zoebuild/src/lib/build/aiCreditResultRetention.ts');

test('reuses protected GitHub Actions scheduling, inactive without explicit repository variable',()=>{
 assert.match(workflow,/on:[\s\S]*schedule:/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/vars\.ZOEBUILD_AI_RESULT_RETENTION_ENABLED == 'true'/);
 assert.match(workflow,/secrets\.ZOEBUILD_AI_RESULT_RETENTION_SECRET/);
 assert.match(workflow,/concurrency:/);
 assert.match(workflow,/permissions:/);
});
test('scheduler sends secret only to fixed canonical HTTPS host and one endpoint',()=>{
 assert.match(workflow,/https:\/\/build\.zoeskoul\.com\/api\/internal\/ai-result-retention/);
 assert.match(workflow,/--request POST/);
 assert.match(workflow,/--connect-timeout 10 --max-time 60/);
 assert.doesNotMatch(workflow,/curl[^\n]*\$\{\{\s*vars\./);
 assert.doesNotMatch(workflow,/--location|--location-trusted/);
});
test('maintenance endpoint requires bearer before touching Prisma and never exposes errors',()=>{
 assert.match(endpoint,/if\(!authorized\(req\)\)/);
 assert.ok(endpoint.indexOf('if(!authorized(req))')<endpoint.indexOf('await purgeExpiredAiCreditResults('));
 assert.match(endpoint,/timingSafeEqual/);
 assert.match(endpoint,/batchSize:CAP/);
 assert.match(endpoint,/const CAP=100/);
 assert.match(endpoint,/MAINTENANCE_UNAUTHORIZED/);
 assert.match(endpoint,/MAINTENANCE_UNAVAILABLE/);
 assert.match(routeTest,/mocks\.purge\)\.not\.toHaveBeenCalled/);
 assert.match(routeTest,/mocks\.purge\)\.toHaveBeenCalledTimes\(1\)/);
});
test('only expired encrypted results are deleted; not financial ledger or provider receipts',()=>{
 assert.match(retention,/FROM "AiCreditResultJournal"/);
 assert.match(retention,/FOR UPDATE SKIP LOCKED/);
 assert.match(retention,/batchSize>100/);
 assert.doesNotMatch(retention,/DELETE FROM "AiCredit(?:Lot|LedgerEntry|Reservation|ProviderRequest)"/);
});
test('Playwright smoke requires real authenticated development project',()=>{
 for(const s of ['ZOEBUILD_E2E_PROJECT_URL','ZOEBUILD_E2E_AUTH_STORAGE_STATE',
  'page.request.get','realContext.status()','authState','page.reload()']) assert.ok(browser.includes(s),s);
 assert.match(browser,/localhost\|127/);
 assert.match(browser,/dev-build/);
});
test('AI interception blocks provider dispatch and checks billing operation identity after reload',()=>{
 assert.match(browser,/page\.route\(`\*\*\$\{intentPath\}`/);
 assert.match(browser,/TEST_UNCERTAIN_NETWORK/);
 assert.match(browser,/x-zoebuild-ai-operation-id/);
 assert.match(id,/X-ZoeBuild-Ai-Operation-Id/);
 assert.match(browser,/expect\(calls\[1\]\.id\)\.toBe\(calls\[0\]\.id\)/);
 assert.match(browser,/expect\(calls\[2\]\.id\)\.not\.toBe\(calls\[0\]\.id\)/);
 assert.match(browser,/expect\(forbiddenDispatches\)\.toBe\(0\)/);
});
test('browser identity persists without raw current prompt or provider output',()=>{
 assert.match(recovery,/SHA-256/);
 assert.match(recovery,/sessionStorage/);
 assert.doesNotMatch(recovery,/setItem\([^\n]*input\.prompt/);
 assert.match(browser,/expect\(persisted\)\.not\.toContain\(prompt\)/);
 assert.match(browser,/expect\(calls\[1\]\.history\)\.toEqual\(calls\[0\]\.history\)/);
 assert.match(shell,/completeAiBrowserAttempt/);
});
