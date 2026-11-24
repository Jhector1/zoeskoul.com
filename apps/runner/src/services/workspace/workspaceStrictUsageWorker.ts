import path from "node:path";
import { Worker } from "node:worker_threads";

type Usage = { bytes: number; entries: number };
type Limits = { maxBytes?: number; maxEntries?: number };

// Trusted, static worker code. The directory and limits are data, not code.
// Keep the existing no-follow, descriptor-anchored traversal and per-name
// byte accounting. No cached totals, exclusions, or weaker quota decisions.
export const STRICT_USAGE_WORKER_SOURCE = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const {parentPort,workerData} = require('node:worker_threads');
const {root,limits} = workerData;
let bytes=0, entries=0;
const exceeded=()=> (limits.maxBytes!==undefined && bytes>limits.maxBytes) ||
  (limits.maxEntries!==undefined && entries>limits.maxEntries);
const same=(a,b)=>a.dev===b.dev && a.ino===b.ino;
const linux=process.platform==='linux';
function walk(current,depth) {
  if (exceeded()) return;
  if (depth>=128) throw Error('depth');
  const original=fs.lstatSync(current,{bigint:true});
  if (!original.isDirectory() || original.isSymbolicLink()) throw Error('directory');
  const fd=fs.openSync(current,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try {
    const opened=fs.fstatSync(fd,{bigint:true});
    if (!opened.isDirectory() || !same(original,opened)) throw Error('identity');
    const anchored=linux ? '/proc/self/fd/'+fd : current;
    const listing=fs.opendirSync(anchored,{bufferSize:128});
    try {
      while (!exceeded()) {
        const child=listing.readSync();
        if (!child) break;
        entries++;
        if (!Number.isSafeInteger(entries)) throw Error('count');
        if (exceeded()) break;
        const target=path.join(anchored,child.name);
        const stat=fs.lstatSync(target,{bigint:true});
        if (stat.isDirectory()) walk(target,depth+1);
        else if (stat.isFile()) {
          const size=Number(stat.size);
          if (!Number.isSafeInteger(size) || size<0 || !Number.isSafeInteger(bytes+size)) throw Error('size');
          bytes+=size;
        }
      }
    } finally { listing.closeSync(); }
    const end=fs.lstatSync(current,{bigint:true});
    if (!same(opened,end) || !end.isDirectory() || end.isSymbolicLink()) throw Error('identity');
  } finally { fs.closeSync(fd); }
}
try { walk(root,0); parentPort.postMessage({ok:true,bytes,entries}); }
catch { parentPort.postMessage({ok:false}); }
`;

// Global bound, not a worker per directory or per file. Keep the slot until
// exit (including termination), so timeouts cannot oversubscribe the Runner.
const MAX_WORKERS = 2;
let active = 0;
const waiters: Array<() => void> = [];
async function reserveWorker(): Promise<() => void> {
  if (active < MAX_WORKERS) active++;
  else await new Promise<void>(resolve => waiters.push(resolve));
  return () => {
    const next = waiters.shift();
    if (next) next(); else active--;
  };
}

function parseUsage(value: unknown): Usage | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Partial<Usage> & { ok?: boolean };
  if (result.ok !== true || typeof result.bytes !== "number" ||
      typeof result.entries !== "number" || !Number.isSafeInteger(result.bytes) ||
      !Number.isSafeInteger(result.entries) || result.bytes < 0 || result.entries < 0) return null;
  return { bytes: result.bytes, entries: result.entries };
}

export async function scanStrictWorkspaceUsage(dir: string, limits: Limits = {}): Promise<Usage> {
  const release = await reserveWorker();
  try {
    return await new Promise<Usage>((resolve, reject) => {
      let result: Usage | null = null;
      let failed = false;
      const worker = new Worker(STRICT_USAGE_WORKER_SOURCE, {
        eval: true, execArgv: [], env: {},
        workerData: { root: path.resolve(dir), limits },
        resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 4 },
      });
      const timeout = setTimeout(() => {
        failed = true;
        void worker.terminate().catch(() => undefined);
      }, 120_000);
      worker.once("message", (value: unknown) => { result = parseUsage(value); });
      worker.once("error", () => { failed = true; });
      worker.once("exit", code => {
        clearTimeout(timeout);
        if (!failed && code === 0 && result) resolve(result);
        else reject(new Error("Runner workspace accounting incomplete."));
      });
    });
  } catch { throw new Error("Runner workspace accounting incomplete."); }
  finally { release(); }
}
