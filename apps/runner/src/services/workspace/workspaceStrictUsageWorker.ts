import path from "node:path";
import { execFile } from "node:child_process";
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

// Linux ZoeBuild only. Keep the helper static and pass paths and ceilings as
// arguments, never executable source. No Python environment or user imports.
export const STRICT_USAGE_PYTHON_SOURCE = String.raw`
import json, os, resource, stat, sys

# Bound the helper independently of the parent process's heap.
resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024, 128 * 1024 * 1024))
MAX_SAFE = 2**53 - 1
root = sys.argv[1]
limits = json.loads(sys.argv[2])
for key, value in limits.items():
    if key not in ('maxBytes', 'maxEntries') or type(value) is not int or not 0 <= value <= MAX_SAFE:
        raise ValueError('limits')
bytes_used = entries = 0
flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC

def exceeded():
    return (entries > limits.get('maxEntries', MAX_SAFE) or
            bytes_used > limits.get('maxBytes', MAX_SAFE))

def same(a, b):
    return (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino)

def walk(name, parent, depth, original):
    global bytes_used, entries
    if exceeded():
        return
    if depth >= 128 or not stat.S_ISDIR(original.st_mode):
        raise ValueError('directory')
    fd = os.open(name, flags, dir_fd=parent)
    try:
        opened = os.fstat(fd)
        if not stat.S_ISDIR(opened.st_mode) or not same(original, opened):
            raise ValueError('identity')
        with os.scandir(fd) as listing:
            while not exceeded():
                entry = next(listing, None)
                if entry is None:
                    break
                entries += 1
                if entries > MAX_SAFE:
                    raise ValueError('count')
                if exceeded():
                    break
                child = os.stat(entry.name, dir_fd=fd, follow_symlinks=False)
                if stat.S_ISDIR(child.st_mode):
                    walk(entry.name, fd, depth + 1, child)
                elif stat.S_ISREG(child.st_mode):
                    if not 0 <= child.st_size <= MAX_SAFE - bytes_used:
                        raise ValueError('size')
                    bytes_used += child.st_size
        end = os.stat(name, dir_fd=parent, follow_symlinks=False)
        if not stat.S_ISDIR(end.st_mode) or not same(opened, end):
            raise ValueError('identity')
    finally:
        os.close(fd)

try:
    walk(root, None, 0, os.stat(root, follow_symlinks=False))
    print(json.dumps({'ok': True, 'bytes': bytes_used, 'entries': entries}))
except Exception:
    sys.exit(1)
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

function scanLinuxUsage(root: string, limits: Limits): Promise<Usage> {
  return new Promise((resolve, reject) => {
    execFile("/usr/bin/python3", ["-I", "-B", "-c", STRICT_USAGE_PYTHON_SOURCE,
      root, JSON.stringify(limits)], {
      cwd: "/", env: {}, timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 4096,
      encoding: "utf8",
    }, (error, stdout) => {
      if (!error) {
        try {
          const result = parseUsage(JSON.parse(stdout));
          if (result) { resolve(result); return; }
        } catch { /* Fail closed; do not print private paths or helper output. */ }
      }
      reject(new Error("Runner workspace accounting incomplete."));
    });
  });
}

export async function scanStrictWorkspaceUsage(dir: string, limits: Limits = {}): Promise<Usage> {
  const release = await reserveWorker();
  try {
    if (process.platform === "linux" && process.env.RUNNER_EXECUTION_POOL === "zoebuild") {
      // Never retry a failed scan with another provider or accept partial totals.
      return await scanLinuxUsage(path.resolve(dir), limits);
    }
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
