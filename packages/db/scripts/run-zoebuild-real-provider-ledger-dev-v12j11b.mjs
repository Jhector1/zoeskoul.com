/**
 * V12J.23: One-shot opt-in real provider -> real development PostgreSQL
 * acceptance. Does NOT authorize platform production billing or live payments.
 * The consent guard is LOCAL to the operator and cannot be removed on success.
 * --check-writer is a key-format preflight only (zero network/DB/ledger calls).
 * If provider outcome is unknown, do NOT retry, even after process termination.
 */
import {spawnSync} from "node:child_process";
import {openSync, closeSync, writeSync, fsyncSync, lstatSync, realpathSync, readFileSync} from "node:fs";
import {dirname,resolve,join,relative,isAbsolute,sep} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const e=process.env;
const APPROVAL="V12J11B_ONE_REAL_PROVIDER_LEDGER_ACCEPTANCE_APPROVED";
const KEY=/^[A-Za-z0-9+/]{43}=$/;
const activeId=e.ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID;
const k=activeId==="v1"?e.ZOEBUILD_AI_RESULT_KEY_V1:
  activeId==="v2"?e.ZOEBUILD_AI_RESULT_KEY_V2:
  activeId==="v3"?e.ZOEBUILD_AI_RESULT_KEY_V3:undefined;
const activeKeyValid=typeof k==="string"&&KEY.test(k)&&
  Buffer.from(k,"base64").length===32&&Buffer.from(k,"base64").toString("base64")===k;
const ok=process.argv.length===3&&process.argv[2]==="--run"&&
 e.ZOEBUILD_REAL_LEDGER_ACCEPTANCE_RUN===APPROVAL&&
 e.AI_SETTLEMENT_ACCEPTANCE_RUN==="V12J8A_VERIFIED_DEVELOPMENT_DATABASE"&&
 e.BILLING_ACCEPTANCE_RUN==="V12J5_VERIFIED_DEVELOPMENT_DATABASE"&&
 e.BILLING_ACCEPTANCE_CONFIRMED_DATABASE==="learnoir_db"&&
 e.BILLING_ACCEPTANCE_CONFIRMED_ROLE==="admin"&&
 e.ZOEBUILD_AI_PROVIDER==="openai"&&e.ZOEBUILD_AI_MODEL==="gpt-6.1-sol"&&
 e.ZOEBUILD_REAL_LEDGER_ACCEPTANCE_MODEL==="gpt-6.1-sol"&&
 Boolean(e.OPENAI_API_KEY?.trim())&&e.NODE_ENV!=="production"&&
 e.ZOEBUILD_AI_CREDITS_ENFORCEMENT!=="required"&&
 activeKeyValid;
function fail(code){console.error(`V12J23_REAL_LEDGER_REFUSED reason=${code} NO_PROVIDER_CALL=YES`);process.exitCode=1;}
if(process.argv.length===3&&process.argv[2]==="--check-writer"){
  if(!activeKeyValid)fail("ACTIVE_WRITER_MISSING_OR_INVALID");
  else console.log(`V12K11B_ACTIVE_WRITER_PREFLIGHT_PASS active=${activeId} providerCalls=0 databaseQueries=0 customerCharges=0`);
}else if(!ok){fail("APPROVAL_ISOLATION_OR_ACTIVE_WRITER_MISSING");}
else {
 try {
  // Read-only DB identity and journal schema checks BEFORE consuming one-shot
  // approval. The acceptance test independently repeats these checks.
  const {verifiedJournalPreflight}=await import("./check-ai-credit-result-schema-v12j10b.mjs");
  const result=await verifiedJournalPreflight();
  if(result.stage!=="applied")throw Error("JOURNAL_SCHEMA_NOT_APPLIED");
  const review=readFileSync(join(root,"apps/zoebuild/src/lib/build/publishedModelPriceReviews.ts"),"utf8");
  const observed=review.match(/model:\s*"gpt-6\.1-sol"[\s\S]{0,350}?observedAt:\s*"([^"\n]+)"/);
  const reviewTime=observed?Date.parse(observed[1]):NaN;
  const age=Date.now()-reviewTime;
  if(!Number.isFinite(reviewTime)||age<0||age>7*24*60*60*1000)
    throw Error("PUBLISHED_PRICE_REVIEW_STALE");
  const dir=realpathSync(join(e.HOME??"", ".config","zoeskoul"));
  const st=lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
    throw Error("PRIVATE_OPERATOR_DIRECTORY_REQUIRED");
  const rel=relative(root,dir);
  if(rel===""||(!rel.startsWith(".."+sep)&&rel!==".."&&!isAbsolute(rel)))
    throw Error("OPERATOR_DIRECTORY_INSIDE_REPO");
  const marker=join(dir,"v12j23-real-provider-ledger-attempt.json");
  let fd;
  try {fd=openSync(marker,"wx",0o600);}
  catch{throw Error("PRIOR_ATTEMPT_REVIEW_REQUIRED_NO_RETRY");}
  const saved={version:"V12J23",status:"STARTED",model:"gpt-6.1-sol",
    database:"learnoir_db",attemptedAt:new Date().toISOString(),
    mayHaveIncurredProviderCharge:true};
  try{writeSync(fd,JSON.stringify(saved)+"\n");fsyncSync(fd);}
  finally{closeSync(fd);}
  console.log("V12J23_APPROVED ONE_SHOT=YES devDatabase=learnoir_db model=gpt-6.1-sol "+
    `activeWriter=${activeId} inputCap=512 outputCap=256 paidProviderCallsMax=1 NO_AUTO_RETRY=YES`);
  // Do not run extra tests or retry automatically after this child. Never
  // claim provider/DB acceptance merely because Vitest exits successfully.
  const child=spawnSync("pnpm",["--filter","@zoeskoul/zoebuild","exec","vitest","run",
    "src/lib/build/realProviderLedger.postgres.acceptance.test.ts"],{
    cwd:root,env:{...e},stdio:"inherit",timeout:150000});
  if(child.error||child.status!==0){
    console.error("V12J23_REAL_LEDGER_REVIEW_REQUIRED NO_AUTO_RETRY=YES");process.exitCode=1;
  }else{
    console.log("V12J23_REAL_LEDGER_TEST_SUITE_PASSED CHECK_TEST_OUTPUT_FOR_SETTLEMENT_EVIDENCE "+
      "customerBillingActivated=NO");
  }
 }catch(error){
  const code=error instanceof Error&&/^[A-Z][A-Z0-9_]+$/.test(error.message)
    ?error.message:"PREFLIGHT_REVIEW_REQUIRED";
  fail(code);
 }
}
