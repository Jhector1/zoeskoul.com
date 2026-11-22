import { Worker } from "node:worker_threads";
import path from "node:path";

// Fresh metadata accounting, not an attestation cache or a kernel quota.
// The synchronous walk runs in a bounded worker, never on the HTTP event loop.
// Descendants are resolved via held Linux directory descriptors. No user code.
const SCAN = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const {parentPort,workerData} = require('node:worker_threads');
const {root,limits} = workerData;
let bytes=0, entries=0;
const exceeded=()=> (limits.maxEntries!==undefined && entries>limits.maxEntries) ||
  (limits.maxBytes!==undefined && bytes>limits.maxBytes);
const same=(a,b)=>a.dev===b.dev && a.ino===b.ino;
function walk(current,depth,expected) {
  if(exceeded()) return;
  if(depth>=128) throw Error('depth');
  const original=fs.lstatSync(current,{bigint:true});
  if(!original.isDirectory() || original.isSymbolicLink() || (expected && !same(original,expected))) throw Error('directory');
  const fd=fs.openSync(current,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try {
    const opened=fs.fstatSync(fd,{bigint:true});
    if(!opened.isDirectory() || !same(original,opened)) throw Error('identity');
    const anchored=process.platform==='linux'?'/proc/self/fd/'+fd:current;
    const listing=fs.opendirSync(anchored,{bufferSize:64});
    try {
      while(!exceeded()) {
        const child=listing.readSync();
        if(!child) break;
        entries++;
        if(!Number.isSafeInteger(entries)) throw Error('entry count');
        if(exceeded()) break;
        const target=path.join(anchored,child.name);
        const st=fs.lstatSync(target,{bigint:true});
        if(st.isDirectory()) walk(target,depth+1,st);
        else if(st.isFile()) {
          if(st.size<0n || st.size>BigInt(Number.MAX_SAFE_INTEGER-bytes)) throw Error('byte count');
          bytes+=Number(st.size);
        }
      }
    } finally {listing.closeSync();}
    const end=fs.lstatSync(current,{bigint:true});
    if(!same(opened,end) || !end.isDirectory() || end.isSymbolicLink()) throw Error('identity');
  } finally {fs.closeSync(fd);}
}
try {walk(root,0);parentPort.postMessage({bytes,entries});}
catch {parentPort.postMessage(null);}
`;

type Limits = { maxBytes?: number; maxEntries?: number };
type Usage = { bytes: number; entries: number };
const MAX_WAITING = 16;
const SCAN_TIMEOUT_MS = 120_000;
const QUEUE_TIMEOUT_MS = 30_000;
let active = false;
const waiters: Array<() => void> = [];
const incomplete = () => new Error("Runner workspace accounting incomplete.");

async function acquire(): Promise<() => void> {
  if (active) {
    if (waiters.length >= MAX_WAITING) throw incomplete();
    await new Promise<void>((resolve,reject) => {
      const ready=()=>{clearTimeout(timer);resolve();};
      const timer=setTimeout(()=>{
        const index=waiters.indexOf(ready);
        if (index>=0) waiters.splice(index,1);
        reject(incomplete());
      },QUEUE_TIMEOUT_MS);
      waiters.push(ready);
    });
  } else active = true;
  return () => {
    const next = waiters.shift();
    if (next) next(); else active = false;
  };
}

/** Only trusted callers supply root and limits. Never retry a failed worker
 * with a weaker scanner. Release the global slot only after worker exit. */
export async function getWorkerDirectoryUsage(root: string, limits: Limits = {}): Promise<Usage> {
  const safeLimits = { maxBytes: limits.maxBytes, maxEntries: limits.maxEntries };
  for (const value of Object.values(safeLimits)) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw incomplete();
  }
  const release = await acquire();
  try {
    return await new Promise<Usage>((resolve, reject) => {
      let result: Usage | null = null;
      let failed = false;
      const worker = new Worker(SCAN, {
        eval: true, execArgv: [], env: {},
        workerData: {root: path.resolve(root), limits: safeLimits},
        resourceLimits: {maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 4},
      });
      const timer = setTimeout(() => {
        failed = true;
        void worker.terminate().catch(() => undefined);
      }, SCAN_TIMEOUT_MS);
      worker.on("message", (value: unknown) => {
        if (!value || typeof value !== "object" || !("bytes" in value) || !("entries" in value) ||
            typeof value.bytes !== "number" || typeof value.entries !== "number" ||
            !Number.isSafeInteger(value.bytes) || value.bytes < 0 ||
            !Number.isSafeInteger(value.entries) || value.entries < 0 || result !== null) {
          failed = true; return;
        }
        result = {bytes:value.bytes, entries:value.entries};
      });
      worker.once("error", () => { failed = true; });
      worker.once("exit", code => {
        clearTimeout(timer);
        if (code === 0 && !failed && result !== null) resolve(result);
        else reject(incomplete());
      });
    });
  } catch { throw incomplete(); }
  finally { release(); }
}
