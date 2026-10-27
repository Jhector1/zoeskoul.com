/**
 * V12K11A: FIRST-KEY ONLY. Never rotates a used writer key, never enables spend.
 * Execute from a trusted operator shell. Nothing is printed that can decrypt data.
 */
import {randomBytes} from "node:crypto";
import {readFileSync,lstatSync,openSync,closeSync,writeSync,fsyncSync,renameSync,unlinkSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {inspectResultWriterKeys} from "./ai-result-key-preflight-v12k11a.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const destination=join(root,".env.shared.local");
const mode=process.argv[2];
const approval="NEW_WRITER_KEY_DOES_NOT_RECOVER_HISTORIC_CIPHERTEXT";
function refuse(code){console.error(`V12K11A_WRITER_REFUSED reason=${code} NO_KEY_PRINTED=YES`);process.exitCode=1;}
if (mode!=="--check" && mode!=="--install-first-v1") refuse("USAGE");
else try {
  const stat=lstatSync(destination);
  if(!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)!==0 || stat.uid!==process.getuid())
    throw Error("ENV_FILE_NOT_PRIVATE_OR_NOT_OWNED");
  const existing=readFileSync(destination,"utf8");
  const assigned=/^(?:export[ \t]+)?ZOEBUILD_AI_RESULT_(?:KEY_V[123]|ACTIVE_KEY_ID)[ \t]*=/m;
  const configured=assigned.test(existing) ||
    ["ZOEBUILD_AI_RESULT_KEY_V1","ZOEBUILD_AI_RESULT_KEY_V2","ZOEBUILD_AI_RESULT_KEY_V3",
      "ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID"].some(name=>Boolean(process.env[name]));
  if(mode==="--check") {
    console.log(`V12K11A_WRITER_CHECK status=${configured?"EXISTING_CONFIGURATION_REVIEW_REQUIRED":"NO_WRITER_CONFIGURED"} keyValuesPrinted=NO`);
  } else {
    if(process.argv.length!==4 || process.argv[3]!==approval) throw Error("EXPLICIT_OPERATOR_CONSENT_REQUIRED");
    if(configured)throw Error("KEY_ALREADY_CONFIGURED_REFUSE_ROTATION");
    if(process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT==="required" ||
       /^(?:export[ \t]+)?ZOEBUILD_AI_CREDITS_ENFORCEMENT[ \t]*=[ \t]*["']?required(?:["']|[ \t#]|$)/m.test(existing))
      throw Error("REFUSE_WHILE_SPENDING_REQUIRED");
    const generated=randomBytes(32).toString("base64");
    if(!inspectResultWriterKeys({v1:generated,activeId:"v1"}).valid)throw Error("KEY_GENERATION_FAILED");
    const additions=`\n# V12K11A: locally generated key; never commit or share.\nZOEBUILD_AI_RESULT_KEY_V1=${generated}\nZOEBUILD_AI_RESULT_ACTIVE_KEY_ID=v1\n`;
    const tmp=destination+`.v12k11a-${randomBytes(8).toString("hex")}.tmp`;
    let fd;
    try {
      fd=openSync(tmp,"wx",0o600);
      writeSync(fd,existing.replace(/\s*$/, "")+"\n"+additions);
      fsyncSync(fd);
      closeSync(fd);fd=undefined;
      // atomic replacement: existing config and all non-key content preserved.
      renameSync(tmp,destination);
    } finally {if(fd!==undefined)closeSync(fd);try{unlinkSync(tmp);}catch{/* renamed */}}
    console.log("V12K11A_FIRST_WRITER_INSTALLED active=v1 requiredMeteringUnchanged=YES keyValuesPrinted=NO");
  }
} catch (error) {
  const code=error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)?error.message:"PREFLIGHT_UNAVAILABLE";
  refuse(code);
}
