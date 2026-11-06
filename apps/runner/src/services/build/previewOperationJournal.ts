import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  previewObservability,
  type PreviewOperationTelemetry,
  type PreviewOperationTimingSnapshot,
  type PreviewStartKind,
  unavailablePreviewOperationTiming,
} from "./previewObservability.js";

/** K20D: only lifecycle metadata is journaled. No actor tokens, source, capability,
 * workspace paths, or Docker identifiers are persisted. A restarted runner cannot
 * safely reattach stopped preview sandboxes (the startup reaper removes them).
 * Therefore a journaled in-flight/ready operation is reported as expired.
 */
export type PreviewOperationStage = "queued" | "workspace" | "dependencies" | "container" | "readiness";
export type PreviewOperationState = "preparing" | "ready" | "failed" | "cancelled";
export type PreviewOperationResult = Readonly<{
  previewId: string; buildProjectId: string; sourceVersion: number; basePath: string; port: 5173;
}>;
export type PreviewOperationStatus = Readonly<{
  operationId: string;
  sourceVersion: number;
  state: PreviewOperationState;
  stage: PreviewOperationStage;
  code?: "PREVIEW_CAPACITY" | "PREVIEW_SOURCE_CONFLICT" | "PREVIEW_START_FAILED" | "PREVIEW_CANCELLED" | "PREVIEW_RUNNER_RESTARTED" | "PREVIEW_LEASE_UNAVAILABLE";
  preview?: PreviewOperationResult;
  timing: PreviewOperationTimingSnapshot;
}>;

type InternalRecord = {
  id: string; key: string; ownerHash: string; projectHash: string; sourceVersion: number;
  state: PreviewOperationState; stage: PreviewOperationStage;
  code?: PreviewOperationStatus["code"]; preview?: PreviewOperationResult;
  expiresAt: number; abort: AbortController;
  pendingWrite: Promise<void>;
  telemetry: PreviewOperationTelemetry;
};
type JournalRecord = Pick<InternalRecord, "id" | "ownerHash" | "projectHash" | "sourceVersion" | "state" | "stage" | "code" | "expiresAt">;
const ID_PATTERN = /^preview_op_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_MS = 60 * 60_000;
const MAX_OPERATIONS = 64;

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function isPreviewOperationId(value: string) { return ID_PATTERN.test(value); }

export class FilePreviewOperationJournal {
  constructor(private readonly dir: string) {}
  private pathname(id: string) {
    if (!isPreviewOperationId(id)) throw new Error("Invalid preview operation id.");
    return path.join(this.dir, `${id}.json`);
  }
  async write(item: JournalRecord) {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const target = this.pathname(item.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(item), { mode: 0o600, flag: "wx" });
      await fs.rename(temporary, target);
    } finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
  }
  async read(id: string): Promise<JournalRecord | null> {
    const raw = await fs.readFile(this.pathname(id), "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    });
    if (raw === null) return null;
    const item: unknown = JSON.parse(raw);
    if (!item || typeof item !== "object") return null;
    const entry = item as JournalRecord;
    if (entry.id !== id || typeof entry.ownerHash !== "string" ||
      typeof entry.expiresAt !== "number" || !Number.isSafeInteger(entry.sourceVersion)) return null;
    return entry;
  }
  async prune(now = Date.now()) {
    const entries = await fs.readdir(this.dir).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [] as string[];
      throw error;
    });
    for (const entry of entries) {
      if (!entry.endsWith(".json") || !isPreviewOperationId(entry.slice(0, -5))) continue;
      const id = entry.slice(0, -5);
      const item = await this.read(id).catch(() => null);
      if (!item || item.expiresAt <= now) await fs.rm(this.pathname(id), { force: true });
    }
  }
}

export class PreviewOperationRegistry<Request> {
  private readonly records = new Map<string, InternalRecord>();
  private readonly keys = new Map<string, string>();
  private readonly workerTasks = new Set<Promise<void>>();
  private readonly reuseTasks = new Map<string, Promise<PreviewOperationStatus | null>>();
  constructor(
    private readonly journal: FilePreviewOperationJournal,
    private readonly worker: (input: { actorKey: string; request: Request; signal: AbortSignal;
      onPhase: (phase: PreviewOperationStage) => void;
      telemetry: PreviewOperationTelemetry }) => Promise<PreviewOperationResult>,
    private readonly cancelPreview: (actorKey: string, previewId: string) => Promise<unknown>,
    private readonly identify: (request: Request) => { buildProjectId: string; sourceVersion: number; fingerprint: string },
    private readonly now = () => Date.now(),
    private readonly telemetryFactory = (input: Readonly<{startKind: PreviewStartKind; reuseCandidate: boolean}>) =>
      previewObservability.beginOperation(input),
    private readonly reuseReady?: (input: Readonly<{actorKey: string; request: Request;
      preview: PreviewOperationResult; telemetry: PreviewOperationTelemetry}>) => Promise<PreviewOperationResult | null>,
    private readonly verifyReady?: (input: Readonly<{actorKey:string;
      preview:PreviewOperationResult}>) => Promise<boolean>,
  ) {}

  private publicStatus(record: InternalRecord): PreviewOperationStatus {
    return { operationId: record.id, sourceVersion: record.sourceVersion,
      state: record.state, stage: record.stage, ...(record.code ? { code: record.code } : {}),
      ...(record.state === "ready" && record.preview ? { preview: record.preview } : {}),
      timing: record.telemetry.snapshot() };
  }
  private persist(record: InternalRecord): Promise<void> {
    const entry: JournalRecord = { id: record.id, ownerHash: record.ownerHash,
      projectHash: record.projectHash, sourceVersion: record.sourceVersion,
      state: record.state, stage: record.stage, code: record.code,
      expiresAt: record.expiresAt };
    record.pendingWrite = record.pendingWrite.catch(() => undefined).then(() => this.journal.write(entry));
    return record.pendingWrite;
  }
  private expireOldRecords() {
    for (const [id, record] of this.records) {
      if (record.expiresAt > this.now() || record.state === "preparing") continue;
      this.records.delete(id);
      if (this.keys.get(record.key) === id) this.keys.delete(record.key);
    }
  }

  async start(actorKey: string, request: Request): Promise<PreviewOperationStatus> {
    const identity = this.identify(request);
    if (!actorKey || !identity.buildProjectId || !Number.isSafeInteger(identity.sourceVersion) || identity.sourceVersion < 1)
      throw new Error("Invalid preview operation.");
    this.expireOldRecords();
    const ownerHash = sha256(actorKey);
    const projectHash = sha256(identity.buildProjectId);
    const key = sha256(`${ownerHash}\0${projectHash}\0${identity.sourceVersion}\0${identity.fingerprint}`);
    // A queued old saved-source token must not race with a newly selected head.
    for (const record of this.records.values()) {
      if (record.ownerHash !== ownerHash || record.projectHash !== projectHash) continue;
      if (record.sourceVersion > identity.sourceVersion)
        throw new Error("Preview source is stale.");
      if (record.sourceVersion < identity.sourceVersion && record.state === "preparing")
        record.abort.abort();
    }
    const previousId = this.keys.get(key);
    const previous = previousId ? this.records.get(previousId) : undefined;
    if (previous && previous.state === "preparing")
      return this.publicStatus(previous);

    if (previous?.state === "ready" && previous.preview && this.reuseReady) {
      let reuseTask = this.reuseTasks.get(key);
      if (!reuseTask) {
        reuseTask = this.tryReuse(actorKey, request, identity, key, ownerHash, projectHash, previous.preview);
        this.reuseTasks.set(key, reuseTask);
        void reuseTask.finally(() => {
          if (this.reuseTasks.get(key) === reuseTask) this.reuseTasks.delete(key);
        }).catch(() => undefined);
      }
      const reused = await reuseTask;
      if (reused) return reused;
      if ([...this.records.values()].some(record =>
        record.ownerHash === ownerHash && record.projectHash === projectHash &&
        record.sourceVersion > identity.sourceVersion)) {
        throw new Error("Preview source is stale.");
      }
    }
    if ([...this.records.values()].filter(r => r.state === "preparing").length >= MAX_OPERATIONS)
      throw new Error("Runner is busy. Preview operation queue is full.");

    const related = [...this.records.values()].filter(item =>
      item.ownerHash === ownerHash && item.projectHash === projectHash);
    const telemetry = this.telemetryFactory({
      startKind: related.length ? "restart" : "cold",
      reuseCandidate: related.some(item => item.state === "ready" && item.key === key),
    });
    const record: InternalRecord = { id: `preview_op_${randomUUID()}`, key, ownerHash, projectHash,
      sourceVersion: identity.sourceVersion, state: "preparing", stage: "queued",
      expiresAt: this.now() + TTL_MS, abort: new AbortController(), pendingWrite: Promise.resolve(), telemetry };
    this.records.set(record.id, record);
    this.keys.set(key, record.id);
    const endAdmission = telemetry.begin("operation_admission");
    try { await this.persist(record); endAdmission("ok"); }
    catch (error) {
      endAdmission("error");
      telemetry.finish("error");
      this.records.delete(record.id); this.keys.delete(key); throw error;
    }

    // The HTTP request owns only the acknowledgement. The runner owns the job,
    // including cancellation and verified cleanup, after the response closes.
    const workerTask = (async () => {
      try {
        const result = await this.worker({ actorKey, request, signal: record.abort.signal, telemetry,
          onPhase: phase => { record.stage = phase; void this.persist(record).catch(() => undefined); } });
        if (record.abort.signal.aborted) {
          await this.cancelPreview(actorKey, result.previewId);
          record.state = "cancelled";
          record.code = "PREVIEW_CANCELLED";
          telemetry.finish("cancelled");
        } else {
          record.preview = result;
          record.state = "ready";
          telemetry.finish("ok");
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "";
        record.code = record.abort.signal.aborted ? "PREVIEW_CANCELLED" :
          msg === "Preview source is stale." ? "PREVIEW_SOURCE_CONFLICT" :
          /Runner is busy|Too many active sessions|Too many code session starts/i.test(msg) ? "PREVIEW_CAPACITY" : "PREVIEW_START_FAILED";
        record.state = record.abort.signal.aborted ? "cancelled" : "failed";
        telemetry.finish(record.abort.signal.aborted ? "cancelled" : "error");
      } finally {
        record.expiresAt = this.now() + TTL_MS;
        await this.persist(record).catch(error => console.error("RUNNER preview operation journal failure", {
          category: "metadata-persistence", message: error instanceof Error ? error.message : "unknown",
        }));
      }
    })();
    this.workerTasks.add(workerTask);
    void workerTask.then(
      () => { this.workerTasks.delete(workerTask); },
      () => { this.workerTasks.delete(workerTask); },
    );
    return this.publicStatus(record);
  }

  private async tryReuse(
    actorKey: string,
    request: Request,
    identity: ReturnType<PreviewOperationRegistry<Request>["identify"]>,
    key: string,
    ownerHash: string,
    projectHash: string,
    preview: PreviewOperationResult,
  ): Promise<PreviewOperationStatus | null> {
    const telemetry = this.telemetryFactory({startKind:"reuse",reuseCandidate:true});
    const endAdmission = telemetry.begin("operation_admission");
    endAdmission("ok");
    let reused: PreviewOperationResult | null = null;
    try {
      reused = await this.reuseReady!({actorKey,request,preview,telemetry});
      if (!reused) {
        telemetry.finish("error");
        return null;
      }
      // A newer source admitted while health was being checked fences this
      // result. Never publish an old lease after a source advance.
      if ([...this.records.values()].some(record =>
        record.ownerHash === ownerHash && record.projectHash === projectHash &&
        record.sourceVersion > identity.sourceVersion)) {
        telemetry.finish("cancelled");
        throw new Error("Preview source is stale.");
      }
      telemetry.finish("ok");
      const record: InternalRecord = {
        id:`preview_op_${randomUUID()}`,key,ownerHash,projectHash,
        sourceVersion:identity.sourceVersion,state:"ready",stage:"readiness",preview:reused,
        expiresAt:this.now()+TTL_MS,abort:new AbortController(),pendingWrite:Promise.resolve(),telemetry,
      };
      this.records.set(record.id,record);
      this.keys.set(key,record.id);
      await this.persist(record);
      return this.publicStatus(record);
    } catch (error) {
      if (!reused) telemetry.finish("error");
      throw error;
    }
  }

  /** Waits for acknowledged background work and its journal writes to settle.
   * Used by test teardown; also safe for a future graceful runner shutdown.
   * Do not call from an HTTP status or startup request.
   */
  async whenSettled(): Promise<void> {
    await Promise.all([...this.workerTasks]);
    await Promise.all([...this.records.values()].map(record => record.pendingWrite));
  }

  async status(operationId: string, actorKey: string, buildProjectId: string): Promise<PreviewOperationStatus | null> {
    if (!isPreviewOperationId(operationId)) return null;
    const ownerHash = sha256(actorKey);
    const existing = this.records.get(operationId);
    if (existing) {
      if (existing.ownerHash !== ownerHash || existing.projectHash !== sha256(buildProjectId)) return null;
      if (existing.state === "ready" && existing.preview && this.verifyReady) {
        const previewId = existing.preview.previewId;
        const healthy = await this.verifyReady({actorKey,preview:existing.preview}).catch(() => false);
        if (!healthy) {
          const writes: Promise<void>[] = [];
          for (const record of this.records.values()) {
            if (record.state !== "ready" || record.preview?.previewId !== previewId) continue;
            record.state = "failed";
            record.code = "PREVIEW_LEASE_UNAVAILABLE";
            record.preview = undefined;
            writes.push(this.persist(record));
          }
          await Promise.all(writes);
        }
      }
      return existing.expiresAt <= this.now() && existing.state !== "preparing"
        ? null : this.publicStatus(existing);
    }
    const persisted = await this.journal.read(operationId);
    if (!persisted || (persisted.ownerHash !== ownerHash || persisted.projectHash !== sha256(buildProjectId)) || persisted.expiresAt <= this.now()) return null;
    return { operationId, sourceVersion: persisted.sourceVersion, stage: persisted.stage,
      state: "failed", code: "PREVIEW_RUNNER_RESTARTED",
      timing: unavailablePreviewOperationTiming("restart") };
  }

  async cancel(operationId: string, actorKey: string, buildProjectId: string): Promise<boolean> {
    const record = this.records.get(operationId);
    if (!record || record.ownerHash !== sha256(actorKey) || record.projectHash !== sha256(buildProjectId)) return false;
    record.abort.abort();
    if (record.state === "ready" && record.preview) {
      await this.cancelPreview(actorKey, record.preview.previewId);
      record.preview = undefined;
    }
    record.state = "cancelled";
    record.code = "PREVIEW_CANCELLED";
    await this.persist(record);
    return true;
  }
}
