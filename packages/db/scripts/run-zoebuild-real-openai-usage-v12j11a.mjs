/** Explicit opt-in: makes a bounded real API request, no wallet or DB calls. */
import {spawnSync} from "node:child_process";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const mode=process.argv[2];
const env=process.env;
const approved=env.ZOEBUILD_REAL_PROVIDER_ACCEPTANCE_RUN==="V12J11A_SINGLE_REAL_REQUEST_APPROVED";
const provider=env.ZOEBUILD_AI_PROVIDER;
const model=env.ZOEBUILD_AI_MODEL;
const reviewed=env.ZOEBUILD_REAL_PROVIDER_ACCEPTANCE_MODEL;
const isValidModel=typeof model==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,100}$/.test(model);
if(process.argv.length!==3 || mode!=="--run" || !approved ||
   provider!=="openai" || !isValidModel || model!==reviewed ||
   !env.OPENAI_API_KEY?.trim() || env.NODE_ENV==="production" ||
   env.ZOEBUILD_AI_CREDITS_ENFORCEMENT==="required"){
 console.error("V12J11A_REAL_PROVIDER_REFUSED reason=OPERATOR_SCOPE_OR_PROVIDER_CONFIG_NOT_VERIFIED");
 process.exitCode=1;
}else{
 console.log(`V12J11A_REAL_PROVIDER_AUTHORIZED model=${model} maxInput=512 maxOutput=256 countCallsMax=1 generationCallsMax=1 customerLedger=NO`);
 const child=spawnSync("pnpm",["--filter","@zoeskoul/zoebuild","exec","vitest","run",
   "src/lib/build/realOpenAiUsageEvidence.acceptance.test.ts"],{
   cwd:root,env:{...env},stdio:"inherit",timeout:90_000,
 });
 if(child.error || child.status!==0){
   console.error("V12J11A_REAL_PROVIDER_ACCEPTANCE_NOT_VERIFIED_NO_AUTO_RETRY");
   process.exitCode=1;
 }else console.log("V12J11A_REAL_PROVIDER_TESTS_PASS customerBillingActivated=NO");
}
