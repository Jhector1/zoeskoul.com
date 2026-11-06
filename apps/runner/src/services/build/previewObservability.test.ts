import { describe, expect, it } from "vitest";
import {
  PREVIEW_OPERATION_TIMING_STAGES,
  PreviewObservability,
} from "./previewObservability.js";

describe("ZoeBuild preview observability", () => {
  it("uses a deterministic monotonic clock and exposes complete successful stages", () => {
    let now = 10;
    const metrics = new PreviewObservability(() => now);
    const trace = metrics.beginOperation({startKind:"cold",reuseCandidate:false});
    for (const stage of PREVIEW_OPERATION_TIMING_STAGES) {
      if (stage === "operation_total") continue;
      const end = trace.begin(stage);
      now += 2.25;
      end("ok");
    }
    now += 1;
    trace.finish("ok");
    const snapshot = trace.snapshot();
    for (const stage of PREVIEW_OPERATION_TIMING_STAGES) {
      expect(snapshot.stages[stage].outcome).toBe("ok");
      expect(snapshot.stages[stage].durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(snapshot.stages[stage].durationMs)).toBe(true);
    }
    expect(metrics.snapshot().operations).toMatchObject({active:0,started:1,succeeded:1});
  });

  it("marks skipped stages unavailable instead of recording misleading zeroes", () => {
    let now = 0;
    const metrics = new PreviewObservability(() => now);
    const trace = metrics.beginOperation({startKind:"restart",reuseCandidate:true});
    const endQueue = trace.begin("queue_wait");
    now = 4;
    endQueue("error");
    trace.finish("error");
    const snapshot = trace.snapshot();
    expect(snapshot.stages.queue_wait).toEqual({outcome:"error",durationMs:4});
    expect(snapshot.stages.workspace_create).toEqual({
      outcome:"unavailable",reason:"prior_stage_failed",
    });
    expect(snapshot.stages.workspace_create).not.toHaveProperty("durationMs");
    expect(metrics.snapshot().operations).toMatchObject({failed:1,reuseCandidates:1});
  });

  it("attributes each possible failing stage without populating later durations", () => {
    for (const failedStage of PREVIEW_OPERATION_TIMING_STAGES) {
      if (failedStage === "operation_total") continue;
      let now = 0;
      const metrics = new PreviewObservability(() => now);
      const trace = metrics.beginOperation({startKind:"cold",reuseCandidate:false});
      const end = trace.begin(failedStage);
      now = 3;
      end("error");
      trace.finish("error");
      const snapshot = trace.snapshot();
      expect(snapshot.stages[failedStage]).toEqual({outcome:"error",durationMs:3});
      for (const stage of PREVIEW_OPERATION_TIMING_STAGES) {
        if (stage === failedStage || stage === "operation_total") continue;
        expect(snapshot.stages[stage]).toEqual({
          outcome:"unavailable",reason:"prior_stage_failed",
        });
      }
    }
  });

  it("keeps concurrent operation timings isolated and clamps invalid elapsed values", () => {
    let now = 100;
    const metrics = new PreviewObservability(() => now);
    const first = metrics.beginOperation({startKind:"cold",reuseCandidate:false});
    const second = metrics.beginOperation({startKind:"restart",reuseCandidate:false});
    const endFirst = first.begin("queue_wait");
    now = 107;
    const endSecond = second.begin("queue_wait");
    now = 109;
    endSecond("ok");
    now = 110;
    endFirst("ok");
    first.finish("ok");
    now = -50;
    second.finish("cancelled");
    expect(first.snapshot().stages.queue_wait.durationMs).toBe(10);
    expect(second.snapshot().stages.queue_wait.durationMs).toBe(2);
    expect(second.snapshot().stages.operation_total.durationMs).toBe(0);
  });

  it("contains only bounded aggregate categories and no caller identities", () => {
    let now = 0;
    const metrics = new PreviewObservability(() => now);
    const trace = metrics.beginOperation({startKind:"cold",reuseCandidate:false});
    now = 100_000_000;
    trace.finish("ok");
    const serialized = JSON.stringify({trace:trace.snapshot(),metrics:metrics.snapshot()});
    expect(serialized).not.toContain("capability-secret");
    expect(serialized).not.toContain("project-");
    expect(trace.snapshot().stages.operation_total.durationMs).toBe(86_400_000);
  });

  it("records bounded dependency-layer outcomes without identity labels", () => {
    let now = 0;
    const metrics = new PreviewObservability(() => now);
    for (const outcome of ["hit", "miss", "rejected", "unavailable", "corrupt"] as const) {
      now += 1;
      metrics.recordDependencyLayerLookup(outcome, now, outcome === "hit" ? 0.5 : null);
    }
    metrics.recordDependencyLayerLease("acquire");
    metrics.recordDependencyLayerLease("release");
    metrics.recordDependencyLayerPublication("published", 4);
    metrics.recordDependencyLayerPublication("skipped", 2);
    metrics.recordDependencyLayerCleanup("evicted");
    metrics.recordDependencyLayerCleanup("failed");
    const snapshot = metrics.snapshot();
    expect(snapshot.dependencyLayers).toEqual({
      lookups: { hit:1, miss:1, rejected:1, unavailable:1, corrupt:1 },
      acquisitions:1,releases:1,publications:1,publicationSkipped:1,
      evictions:1,cleanupFailures:1,
    });
    expect(JSON.stringify(snapshot)).not.toContain("owner-a");
  });
});
