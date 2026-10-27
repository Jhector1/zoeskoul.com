/**
 * V12J.19 source-and-env activation report. Reads repository-approved registries
 * and key PRESENCE only; it is not a model pricing certifier or permission to
 * charge customers. No DB/provider/Stripe access and no secrets printed.
 */
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectResultWriterKeys} from './ai-result-key-preflight-v12k11a.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=rel=>readFileSync(resolve(root,rel),'utf8');
const B='apps/zoebuild/src/lib/build/';
function emptyArray(source,name){
  const declaration=new RegExp(String.raw`export const ${name}\s*:[^=]*=\s*Object\.freeze\(\[\]\)`);
  return declaration.test(source);
}
const modelProfiles=read(B+'verifiedAiCreditReservationPolicy.ts');
const operations=read(B+'productionAiBillingReadiness.ts');
const funding=read('apps/web/src/lib/billing/zoeBuildAiCreditStripeFunding.ts');
const writer=inspectResultWriterKeys({
  v1:process.env.ZOEBUILD_AI_RESULT_KEY_V1,
  v2:process.env.ZOEBUILD_AI_RESULT_KEY_V2,
  v3:process.env.ZOEBUILD_AI_RESULT_KEY_V3,
  activeId:process.env.ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID,
});
const checks={
  paidModelProfileApproved:!emptyArray(modelProfiles,'ZOEBUILD_VERIFIED_AI_BILLING_PROFILES'),
  independentOperationsApproved:!emptyArray(operations,'ZOEBUILD_APPROVED_BILLING_OPERATIONS'),
  liveCreditPackApproved:!emptyArray(funding,'APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS'),
  providerKeyPresent:Boolean(process.env.OPENAI_API_KEY?.trim()),
  activeResultWriterKeyPresent:writer.activePresent,
  activeResultWriterKeyValid:writer.valid,
  requiredMeteringSelected:process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT==='required',
};
console.log('=== ZOEBUILD AI PRODUCTION ACTIVATION INVENTORY ===');
for(const [name,valid] of Object.entries(checks)) console.log(`${name}=${valid?'PRESENT_NEEDS_INDEPENDENT_VERIFICATION':'BLOCKED'}`);
console.log(`ACTIVE_RESULT_KEY_VERSION=${writer.activeVersion}`);
console.log(`AVAILABLE_RESULT_KEY_VERSIONS=${writer.configuredVersions.join(',')||'none'}`);
console.log('NO_DB_NO_STRIPE_NO_PROVIDER_NO_SECRETS_PRINTED');
console.log('NOTE=The boolean inventory is not proof of real-world approvals, price, transport scope, or operational signoff.');
console.log('PRODUCTION_ACTIVATION='+(Object.values(checks).every(Boolean)?'REVIEW_STILL_REQUIRED':'BLOCKED'));
