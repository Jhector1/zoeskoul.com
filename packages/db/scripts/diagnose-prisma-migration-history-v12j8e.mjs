/** V12J.8E read-only Prisma history diagnosis. No deploy, SQL writes, or ledger reads. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {listLocalMigrations, readHistory, MIGRATION_NAME} from './apply-ai-credit-quantity-migration-v12j8d.mjs';
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const safeName = name => typeof name === 'string' && /^\d{14}_[A-Za-z0-9_]{1,120}$/.test(name);
const cap = 30;

export function diagnoseHistory(local, history) {
  if (!Array.isArray(local) || !Array.isArray(history) ||
      local.length < 2 || local.at(-1)?.name !== MIGRATION_NAME ||
      local.some(x => !safeName(x.name) || !/^[a-f0-9]{64}$/.test(x.checksum)) ||
      history.some(x => !safeName(x.name) || typeof x.finished !== 'boolean' ||
        typeof x.rolledBack !== 'boolean' || typeof x.checksum !== 'string'))
    throw Error('V12J8E_INVALID_HISTORY_DATA');
  const localMap = new Map(local.map(row=>[row.name,row.checksum]));
  if (localMap.size !== local.length) throw Error('V12J8E_DUPLICATE_LOCAL');
  const events=[], counts={};
  const put=(reason,name)=>{counts[reason]=(counts[reason]||0)+1;if(events.length<cap)events.push({reason,name});};
  const activeCounts=new Map();
  const finished=new Set();
  for(const r of history) {
    const known=localMap.has(r.name);
    if(r.rolledBack) {
      put('ROLLED_BACK_ATTEMPT_REQUIRES_REVIEW',r.name);
      if (r.finished) put('INVALID_FINISHED_AND_ROLLED_BACK',r.name);
      continue;
    }
    activeCounts.set(r.name,(activeCounts.get(r.name)||0)+1);
    if(!known) put('UNKNOWN_DATABASE_MIGRATION',r.name);
    if(!r.finished) put('UNRESOLVED_OR_INCOMPLETE_ATTEMPT',r.name);
    else {
      finished.add(r.name);
      if(known && r.checksum !== localMap.get(r.name)) put('APPLIED_CHECKSUM_DIFFERENCE',r.name);
      if(r.name === MIGRATION_NAME) put('TARGET_ALREADY_APPLIED',r.name);
    }
  }
  for(const [name,count] of activeCounts)if(count>1)put('DUPLICATE_NON_ROLLED_BACK_HISTORY',name);
  for(const entry of local.slice(0,-1))if(!finished.has(entry.name))put('UNAPPLIED_LOCAL_PREDECESSOR',entry.name);
  if(!history.some(x=>x.name===MIGRATION_NAME))put('TARGET_PENDING_EXPECTED',MIGRATION_NAME);
  const blocking = Object.entries(counts).filter(([key])=>key!=='TARGET_PENDING_EXPECTED');
  return {ok:blocking.length===0 && counts.TARGET_PENDING_EXPECTED===1,
    localCount:local.length, historyRows:history.length, finishedCount:finished.size,
    counts, findings:events, truncated: Math.max(0,Object.values(counts).reduce((a,b)=>a+b,0)-events.length)};
}

export function formatDiagnostic(d) {
  const lines=[`V12J8E_HISTORY_AUDIT local=${d.localCount} databaseRows=${d.historyRows} completedDistinct=${d.finishedCount} readOnly=YES`];
  for(const [name,count] of Object.entries(d.counts).sort())lines.push(`V12J8E_COUNT ${name}=${count}`);
  for(const {reason,name} of d.findings)lines.push(`V12J8E_FINDING ${reason} migration=${name}`);
  if(d.truncated>0)lines.push(`V12J8E_FINDINGS_TRUNCATED=${d.truncated}`);
  lines.push(d.ok?'V12J8E_HISTORY_READY_CHECK_ORIGINAL_PREFLIGHT':'V12J8E_HISTORY_REVIEW_REQUIRED_NO_MIGRATION');
  return lines.join('\n');
}

async function main(){
  let pool;
  try {
    if(process.argv.length!==3 || process.argv[2]!=='--inspect')throw Error('V12J8E_USAGE');
    if(process.env.AI_SETTLEMENT_ACCEPTANCE_RUN!=='V12J8A_VERIFIED_DEVELOPMENT_DATABASE' ||
      process.env.BILLING_ACCEPTANCE_CONFIRMED_DATABASE!=='learnoir_db' ||
      process.env.BILLING_ACCEPTANCE_CONFIRMED_ROLE!=='admin')
      throw Error('V12J8E_EXPLICIT_DEVELOPMENT_APPROVAL_REQUIRED');
    process.env.BILLING_ACCEPTANCE_RUN='V12J5_VERIFIED_DEVELOPMENT_DATABASE';
    const {preflightBillingDevelopmentDatabase, selectedDevDatabaseUrl}=
      await import('./billing-postgres-dev-preflight.mjs');
    const url=selectedDevDatabaseUrl();
    const identity=await preflightBillingDevelopmentDatabase(url);
    if(!url || !identity?.ok || identity.database!=='learnoir_db' || identity.role!=='admin')
      throw Error('V12J8E_DATABASE_PREFLIGHT_REFUSED');
    const local=listLocalMigrations();
    const {Pool}=await import('pg');
    pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:7000,statement_timeout:15000});
    const client=await pool.connect();
    let history;
    try { history=await readHistory(client,identity); } finally { client.release(); }
    const diagnosis=diagnoseHistory(local,history);
    console.log(formatDiagnostic(diagnosis));
    if(!diagnosis.ok)process.exitCode=2;
  } catch(e) {
    const msg=e instanceof Error && /^V12J8[DE]_[A-Z_]+$/.test(e.message) ? e.message : 'V12J8E_UNEXPECTED_ERROR';
    console.error(`V12J8E_REFUSED reason=${msg}`);
    process.exitCode=1;
  } finally {if(pool)await pool.end();}
}
if(isMain)await main();
