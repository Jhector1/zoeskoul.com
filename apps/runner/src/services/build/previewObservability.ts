import { performance } from "node:perf_hooks";

export const PREVIEW_OPERATION_TIMING_STAGES = [
  "operation_admission",
  "queue_wait",
  "runner_authorization",
  "reuse_health_check",
  "workspace_create",
  "dependency_install",
  "container_launch",
  "vite_readiness",
  "first_ssr",
  "operation_total",
] as const;

export type PreviewOperationTimingStage = typeof PREVIEW_OPERATION_TIMING_STAGES[number];
export type PreviewTimingOutcome = "ok" | "error" | "cancelled" | "pending" | "unavailable" | "skipped";
export type PreviewStartKind = "cold" | "restart" | "reuse";

export const DEVELOPMENT_UPDATE_STAGES = [
  "queue_wait", "owner_check", "pre_write_authority", "source_resolve",
  "admission", "workspace_verify", "workspace_write", "post_write_authority",
  "lease_commit", "snapshot_publish", "cleanup", "total",
] as const;
export type DevelopmentUpdateStage = typeof DEVELOPMENT_UPDATE_STAGES[number];

export type PreviewStageTiming = Readonly<{
  outcome: PreviewTimingOutcome;
  durationMs?: number;
  reason?: "not_started" | "in_progress" | "prior_stage_failed" | "cache_hit";
}>;

export type PreviewOperationTimingSnapshot = Readonly<{
  startKind: PreviewStartKind;
  reuseCandidate: boolean;
  stages: Readonly<Record<PreviewOperationTimingStage, PreviewStageTiming>>;
}>;

const STARTUP_DETAIL_STAGES = [
  "publication_queue", "source_inspect", "publication_lookup", "publication_sweep",
  "dependency_copy", "detached_attestation", "staging_cleanup",
  "transport_retire", "container_remove", "workspace_reclaim", "cleanup_journal",
  "native_source_authority", "native_runtime_identity", "native_source_recheck", "native_prior_lease_retire",
] as const;
type StartupDetailStage = typeof STARTUP_DETAIL_STAGES[number];

type FinalOutcome = "ok" | "error" | "cancelled";
type Clock = () => number;
type DurationSummary = { count: number; totalMs: number; maxMs: number };
export type DependencyLayerLookupOutcome =
  | "hit" | "miss" | "rejected" | "unavailable" | "corrupt";

const MAX_DURATION_MS = 24 * 60 * 60_000;

function safeDuration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(MAX_DURATION_MS, Math.max(0, value)) * 10) / 10;
}

function emptySummary(): DurationSummary {
  return { count: 0, totalMs: 0, maxMs: 0 };
}

export class PreviewObservability {
  private readonly durations = new Map<string, DurationSummary>();
  private readonly nativeStartup = { active: 0, started: 0, succeeded: 0, failed: 0, cancelled: 0 };
  private operationsActive = 0;
  private operationsStarted = 0;
  private operationsSucceeded = 0;
  private operationsFailed = 0;
  private operationsCancelled = 0;
  private reuseCandidates = 0;
  private leasesReused = 0;
  private dependencyInstallsStarted = 0;
  private dependencyInstallsSucceeded = 0;
  private dependencyInstallsFailed = 0;
  private dockerExecActive = 0;
  private dockerExecStarted = 0;
  private dockerExecFailed = 0;
  private transportRequestsActive=0;
  private transportRequestsStarted=0;
  private transportRequestsFailed=0;
  private readinessTransportFailures=0;
  private readonly transportFailureStages:Record<string,number>={};
  private cleanupAttempts = 0;
  private cleanupFailures = 0;
  private readonly dependencyLayerLookups: Record<DependencyLayerLookupOutcome, number> = {
    hit: 0, miss: 0, rejected: 0, unavailable: 0, corrupt: 0,
  };
  private dependencyLayerAcquisitions = 0;
  private dependencyLayerReleases = 0;
  private dependencyLayerPublications = 0;
  private dependencyLayerPublicationSkipped = 0;
  private dependencyLayerEvictions = 0;
  private dependencyLayerCleanupFailures = 0;

  constructor(private readonly clock: Clock = () => performance.now()) {}

  now(): number {
    return this.clock();
  }

  private observe(name: string, durationMs: number) {
    const duration = safeDuration(durationMs);
    const summary = this.durations.get(name) ?? emptySummary();
    summary.count += 1;
    summary.totalMs = safeDuration(summary.totalMs + duration);
    summary.maxMs = Math.max(summary.maxMs, duration);
    this.durations.set(name, summary);
  }

  beginOperation(input: Readonly<{startKind: PreviewStartKind; reuseCandidate: boolean}>) {
    this.operationsActive += 1;
    this.operationsStarted += 1;
    if (input.reuseCandidate) this.reuseCandidates += 1;
    return new PreviewOperationTelemetry(this, input, this.now());
  }

  // Native development start has a different HTTP lifecycle from the legacy
  // operation registry. Keep its aggregate counts and stage series separate.
  beginNativeStartup() {
    this.nativeStartup.active += 1;
    this.nativeStartup.started += 1;
    const sink = {
      now: () => this.now(),
      recordStage: (stage: PreviewOperationTimingStage, durationMs: number) => {
        this.observe(`native_start.stage.${stage}`, durationMs);
      },
      finishOperation: (outcome: FinalOutcome) => {
        this.nativeStartup.active -= 1;
        if (outcome === "ok") this.nativeStartup.succeeded += 1;
        else if (outcome === "cancelled") this.nativeStartup.cancelled += 1;
        else this.nativeStartup.failed += 1;
      },
    };
    // The timing sink does not export a cold/reuse classification: actual
    // stages (e.g. no workspace_create for reattachment) provide evidence.
    return new PreviewOperationTelemetry(sink, {startKind:"cold",reuseCandidate:false}, this.now());
  }

  finishOperation(outcome: FinalOutcome) {
    this.operationsActive = Math.max(0, this.operationsActive - 1);
    if (outcome === "ok") this.operationsSucceeded += 1;
    else if (outcome === "cancelled") this.operationsCancelled += 1;
    else this.operationsFailed += 1;
  }

  recordStage(name: PreviewOperationTimingStage, durationMs: number) {
    this.observe(`stage.${name}`, durationMs);
  }

  recordDevelopmentUpdateStage(stage: DevelopmentUpdateStage,
    outcome: "ok" | "error" | "restart_required", durationMs: number) {
    // Fixed dimensions only. Never pass identity, source or error text.
    if (!DEVELOPMENT_UPDATE_STAGES.includes(stage) ||
        !["ok", "error", "restart_required"].includes(outcome)) return;
    this.observe(`development_update.${stage}.${outcome}`, durationMs);
  }

  async measureStartupDetail<T>(stage: StartupDetailStage, work: () => Promise<T>): Promise<T> {
    const startedAt = this.now();
    let outcome: "ok" | "error" = "error";
    try {
      const value = await work();
      outcome = "ok";
      return value;
    } finally {
      if (STARTUP_DETAIL_STAGES.includes(stage))
        this.observe(`startup_detail.${stage}.${outcome}`, this.now() - startedAt);
    }
  }

  recordLeaseReuse() {
    this.leasesReused += 1;
  }

  beginDependencyInstall() {
    this.dependencyInstallsStarted += 1;
    const startedAt = this.now();
    let finished = false;
    return (outcome: "ok" | "error") => {
      if (finished) return;
      finished = true;
      if (outcome === "ok") this.dependencyInstallsSucceeded += 1;
      else this.dependencyInstallsFailed += 1;
      this.observe("dependency_install", this.now() - startedAt);
    };
  }

  recordDependencyLayerLookup(
    outcome: DependencyLayerLookupOutcome,
    durationMs: number,
    verificationMs: number | null,
  ) {
    this.dependencyLayerLookups[outcome] += 1;
    this.observe("dependency_layer_lookup", durationMs);
    if (verificationMs !== null)
      this.observe("dependency_layer_verification", verificationMs);
  }

  recordDependencyLayerLease(event: "acquire" | "release") {
    if (event === "acquire") this.dependencyLayerAcquisitions += 1;
    else this.dependencyLayerReleases += 1;
  }

  recordDependencyLayerPublication(outcome: "published" | "skipped", durationMs: number) {
    if (outcome === "published") this.dependencyLayerPublications += 1;
    else this.dependencyLayerPublicationSkipped += 1;
    this.observe("dependency_layer_publication", durationMs);
  }

  recordDependencyLayerCleanup(outcome: "evicted" | "failed") {
    if (outcome === "evicted") this.dependencyLayerEvictions += 1;
    else this.dependencyLayerCleanupFailures += 1;
  }

  beginDockerExec() {
    this.dockerExecActive += 1;
    this.dockerExecStarted += 1;
    const startedAt = this.now();
    let finished = false;
    return (outcome: "ok" | "error") => {
      if (finished) return;
      finished = true;
      this.dockerExecActive = Math.max(0, this.dockerExecActive - 1);
      if (outcome === "error") this.dockerExecFailed += 1;
      this.observe("docker_exec", this.now() - startedAt);
    };
  }

  beginTransportRequest(purpose:"readiness"|"application") {
    this.transportRequestsActive++;
    this.transportRequestsStarted++;
    const startedAt=this.now();
    let finished=false;
    return (stage:string|null)=>{
      if(finished)return;
      finished=true;
      this.transportRequestsActive=Math.max(0,this.transportRequestsActive-1);
      if(stage!==null){
        this.transportRequestsFailed++;
        if(purpose==="readiness")this.readinessTransportFailures++;
        if(/^[a-z_]{3,40}$/.test(stage))
          this.transportFailureStages[stage]=(this.transportFailureStages[stage]??0)+1;
      }
      this.observe("transport_request",this.now()-startedAt);
    };
  }

  observeViteUpstream(durationMs: number) {
    this.observe("vite_upstream", durationMs);
  }

  beginCleanup() {
    this.cleanupAttempts += 1;
    const startedAt = this.now();
    let finished = false;
    return (outcome: "ok" | "error") => {
      if (finished) return;
      finished = true;
      if (outcome === "error") this.cleanupFailures += 1;
      this.observe("cleanup", this.now() - startedAt);
    };
  }

  snapshot() {
    return {
      nativeStartup: { ...this.nativeStartup },
      operations: {
        active: this.operationsActive,
        started: this.operationsStarted,
        succeeded: this.operationsSucceeded,
        failed: this.operationsFailed,
        cancelled: this.operationsCancelled,
        reuseCandidates: this.reuseCandidates,
        leasesReused: this.leasesReused,
      },
      dependencyInstalls: {
        started: this.dependencyInstallsStarted,
        succeeded: this.dependencyInstallsSucceeded,
        failed: this.dependencyInstallsFailed,
      },
      dockerExec: {
        active: this.dockerExecActive,
        started: this.dockerExecStarted,
        failed: this.dockerExecFailed,
      },
      transportRequests:{
        active:this.transportRequestsActive,
        started:this.transportRequestsStarted,
        failed:this.transportRequestsFailed,
        readinessFailures:this.readinessTransportFailures,
        failureStages:{...this.transportFailureStages},
      },
      cleanup: { attempts: this.cleanupAttempts, failures: this.cleanupFailures },
      dependencyLayers: {
        lookups: { ...this.dependencyLayerLookups },
        acquisitions: this.dependencyLayerAcquisitions,
        releases: this.dependencyLayerReleases,
        publications: this.dependencyLayerPublications,
        publicationSkipped: this.dependencyLayerPublicationSkipped,
        evictions: this.dependencyLayerEvictions,
        cleanupFailures: this.dependencyLayerCleanupFailures,
      },
      durations: Object.fromEntries([...this.durations.entries()].map(([name, value]):
        [string, DurationSummary] => [name, { ...value }]).sort(([a], [b]) => a.localeCompare(b))),
    } as const;
  }
}

export class PreviewOperationTelemetry {
  private readonly stages = new Map<PreviewOperationTimingStage, PreviewStageTiming>();
  private finalOutcome: FinalOutcome | null = null;

  constructor(
    private readonly metrics: Pick<PreviewObservability, "now" | "recordStage" | "finishOperation">,
    private readonly identity: Readonly<{startKind: PreviewStartKind; reuseCandidate: boolean}>,
    private readonly startedAt: number,
  ) {}

  begin(stage: Exclude<PreviewOperationTimingStage, "operation_total">) {
    const startedAt = this.metrics.now();
    this.stages.set(stage, { outcome: "pending", reason: "in_progress" });
    let finished = false;
    return (outcome: Exclude<PreviewTimingOutcome, "pending" | "unavailable" | "skipped">) => {
      if (finished) return;
      finished = true;
      const durationMs = safeDuration(this.metrics.now() - startedAt);
      this.stages.set(stage, { outcome, durationMs });
      this.metrics.recordStage(stage, durationMs);
    };
  }

  skipped(stage: Exclude<PreviewOperationTimingStage, "operation_total">, reason: "cache_hit") {
    if (!this.stages.has(stage)) this.stages.set(stage, { outcome: "skipped", reason });
  }

  unavailable(stage: Exclude<PreviewOperationTimingStage, "operation_total">) {
    if (!this.stages.has(stage)) this.stages.set(stage, {
      outcome: "unavailable", reason: "prior_stage_failed",
    });
  }

  finish(outcome: FinalOutcome) {
    if (this.finalOutcome) return;
    this.finalOutcome = outcome;
    const durationMs = safeDuration(this.metrics.now() - this.startedAt);
    this.stages.set("operation_total", { outcome, durationMs });
    this.metrics.recordStage("operation_total", durationMs);
    this.metrics.finishOperation(outcome);
  }

  snapshot(): PreviewOperationTimingSnapshot {
    const terminal = this.finalOutcome !== null;
    const stages = Object.fromEntries(PREVIEW_OPERATION_TIMING_STAGES.map(stage => {
      const observed = this.stages.get(stage);
      return [stage, observed ?? (terminal
        ? { outcome: "unavailable", reason: "prior_stage_failed" }
        : { outcome: "pending", reason: "not_started" })];
    })) as Record<PreviewOperationTimingStage, PreviewStageTiming>;
    return { ...this.identity, stages };
  }
}

export const previewObservability = new PreviewObservability();

export function boundedPreviewDuration(value: number): number {
  return safeDuration(value);
}

export function unavailablePreviewOperationTiming(
  startKind: PreviewStartKind,
): PreviewOperationTimingSnapshot {
  return {
    startKind,
    reuseCandidate: false,
    stages: Object.fromEntries(PREVIEW_OPERATION_TIMING_STAGES.map(stage => [stage, {
      outcome: "unavailable",
      reason: "prior_stage_failed",
    }])) as Record<PreviewOperationTimingStage, PreviewStageTiming>,
  };
}
