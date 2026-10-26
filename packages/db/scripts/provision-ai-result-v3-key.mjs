/** Provision a distinct v3 AI-result writer key. Does not read or modify DB,
 * does not replace existing v1/v2 keys, and never prints the generated secret.
 * Store the returned file in a secret manager before deploying. */
import {randomBytes} from 'node:crypto';
import {openSync,closeSync,writeSync,fsyncSync,unlinkSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);
const repo=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../../..'));
function inside(root,target){const rel=relative(root,target);return rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel));}
function run(){
  const ix=args.indexOf('--output');
  if(args.length!==3||ix<0||args[ix+1]?.startsWith('--')||
     !args.includes('--new-v3-key')||!isAbsolute(args[ix+1]))
    throw Error('USE_--output_ABSOLUTE_PATH_--new-v3-key');
  const requested=resolve(args[ix+1]);
  // Parent must preexist; never recursively create a secret file beneath a
  // symlink or repo alias. Resolve aliases before containment checks.
  const parent=realpathSync(dirname(requested));
  const canonical=resolve(parent,requested.slice(dirname(requested).length+1));
  if(inside(repo,canonical))
    throw Error('SECRET_OUTPUT_WITHIN_REPOSITORY_OR_CWD');
  const stat=lstatSync(parent);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
    throw Error('SECRET_PARENT_NOT_PRIVATE_0700');
  let fd;
  try {
    fd=openSync(canonical,'wx',0o600);
    writeSync(fd,`ZOEBUILD_AI_RESULT_KEY_V3=${randomBytes(32).toString('base64')}\nZOEBUILD_AI_RESULT_ACTIVE_KEY_ID=v3\n`);
    fsyncSync(fd);closeSync(fd);fd=undefined;
    console.log('V3_KEY_PROVISION_PASS FILE_MODE=0600 SECRET_NOT_PRINTED NO_DB_NO_PROVIDER');
  } catch(err) {
    if(fd!==undefined){try{closeSync(fd)}catch{};try{unlinkSync(canonical)}catch{}}
    throw err;
  }
}
try{run()}catch(error){console.error('V3_KEY_PROVISION_REFUSED',error instanceof Error?error.message:'UNKNOWN');process.exitCode=2;}
