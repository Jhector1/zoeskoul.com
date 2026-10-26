/**
 * Offline key generation only AFTER the disposable journal has been cleared.
 * Writes secret to a new 0600 file; NEVER prints key, alters .env, or accesses DB.
 */
import { randomBytes } from 'node:crypto';
import { openSync, closeSync, writeSync, unlinkSync, mkdirSync, statSync, lstatSync, existsSync, realpathSync, fsyncSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const at=argv.indexOf('--output');
const output=at<0?null:argv[at+1];
// Canonicalize BEFORE comparing directories. On macOS /var is a symlink to
// /private/var; comparing an OS-canonical cwd against a lexical /var path can
// wrongly allow writing a key inside the repository.
function canonicalCandidate(file) {
  let parent=dirname(file);
  const missing=[];
  while (!existsSync(parent)) {
    missing.unshift(basename(parent));
    const next=dirname(parent);
    if (next===parent) throw Error('SECRET_PARENT_INVALID');
    parent=next;
  }
  return resolve(realpathSync(parent), ...missing, basename(file));
}
function within(root,file) {
  const rel=relative(root,file);
  return !isAbsolute(rel) && rel!=='..' && !rel.startsWith('..'+sep);
}
function assertOutsideProtectedRoots(file) {
  const canonical=canonicalCandidate(file);
  const workingDir=realpathSync(process.cwd());
  // Determine repository from this installed script, independent of caller cwd.
  const projectRoot=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
  if (within(workingDir,canonical) || within(projectRoot,canonical))
    throw Error('SECRET_OUTPUT_MUST_BE_OUTSIDE_CURRENT_REPO');
  return canonical;
}
function main(){
  if (argv.includes('--help')) {
    console.log('USAGE: node packages/db/scripts/provision-ai-result-key.mjs --output "$HOME/.config/zoeskoul/ai-result-v1.env" --confirm-empty-result-journal');
    return;
  }
  if (argv.filter(x=>x==='--output').length!==1 || !output || output.startsWith('--') ||
      !argv.includes('--confirm-empty-result-journal')) throw Error('EXPLICIT_OUTPUT_AND_EMPTY_JOURNAL_ATTESTATION_REQUIRED');
  if (process.env.ZOEBUILD_AI_RESULT_KEY_V1 || process.env.ZOEBUILD_AI_RESULT_KEY_V2)
    throw Error('EXISTING_RESULT_KEY_PRESENT_REFUSE_OVERWRITE');
  const filepath=resolve(output);
  if (!isAbsolute(output)) throw Error('SECRET_OUTPUT_MUST_BE_ABSOLUTE');
  // Refuse protected paths before creating even a directory in the repository.
  assertOutsideProtectedRoots(filepath);
  const parent=dirname(filepath);
  mkdirSync(parent,{recursive:true,mode:0o700});
  // Strict: refuse writing into symlinked or group/world-writable directories.
  // Reject symlink aliases again after mkdir, before opening the key file.
  assertOutsideProtectedRoots(filepath);
  const dir=lstatSync(parent);
  if(!dir.isDirectory() || dir.isSymbolicLink() || (statSync(parent).mode & 0o022)!==0)
    throw Error('SECRET_DIRECTORY_PERMISSIONS_UNSAFE');
  let fd;
  try {
    fd=openSync(filepath,'wx',0o600);
    const key=randomBytes(32).toString('base64');
    writeSync(fd,`ZOEBUILD_AI_RESULT_KEY_V1=${key}\nZOEBUILD_AI_RESULT_ACTIVE_KEY_ID=v1\n`);
    fsyncSync(fd);
    closeSync(fd); fd=undefined;
    console.log('KEY_PROVISION_PASS NEW_FILE_MODE=0600 KEY_PRINTED=NO REPO_MODIFIED=NO');
    console.log('ACTION=Load the secure file into your development environment only after resetting disposable ciphertext. Do not commit or upload it.');
  } catch(error) {
    if(fd!==undefined){try{closeSync(fd);}catch{};try{unlinkSync(filepath);}catch{}}
    throw error;
  }
}
try{main();}catch(error){console.error('KEY_PROVISION_ABORTED',error instanceof Error?error.message:'UNKNOWN');process.exitCode=2;}
