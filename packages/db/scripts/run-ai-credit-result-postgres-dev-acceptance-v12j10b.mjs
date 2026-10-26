/** Read-only migration gate before retained synthetic PostgreSQL fixtures. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifiedJournalPreflight } from './check-ai-credit-result-schema-v12j10b.mjs';
try {
  const result=await verifiedJournalPreflight();
  if(result.stage!=='applied')throw Error('JOURNAL_SCHEMA_NOT_DEPLOYED');
  console.log('V12J10B_POSTGRES_ACCEPTANCE_AUTHORIZED database=learnoir_db syntheticWrites=YES realProvider=NO');
  const cwd=fileURLToPath(new URL('../../..',import.meta.url));
  const child=spawnSync('pnpm',['--filter','@zoeskoul/zoebuild','exec','vitest','run',
    'src/lib/build/aiCreditResultJournal.postgres.acceptance.test.ts'],{
    cwd,env:process.env,stdio:'inherit',timeout:180000});
  process.exitCode=child.status??1;
}catch(e){console.error('V12J10B_PG_REFUSED reason='+
  (e instanceof Error && /^[A-Z_]+$/.test(e.message)?e.message:'JOURNAL_REVIEW_REQUIRED'));
 process.exitCode=1;}
