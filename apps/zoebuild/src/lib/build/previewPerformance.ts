export type PreviewBrowserTimingStage =
  | "start_acknowledgement"
  | "dependency_bootstrap"
  | "operation_ready"
  | "document_response"
  | "stylesheet_delivery"
  | "javascript_delivery"
  | "document_to_rendered"
  | "intent_to_rendered";

export type PreviewBrowserTimingKind = "cold" | "restart" | "reuse" | "reopen" | "navigation" | "refresh";
export type PreviewBrowserTimingOutcome = "ok" | "error" | "cancelled" | "unavailable";

export type PreviewBrowserTimingEntry = Readonly<{
  stage: PreviewBrowserTimingStage;
  kind: PreviewBrowserTimingKind;
  outcome: PreviewBrowserTimingOutcome;
  durationMs?: number;
}>;

const MAX_DURATION_MS = 24 * 60 * 60_000;
const MAX_BROWSER_ENTRIES = 64;
const browserEntries: PreviewBrowserTimingEntry[] = [];

export function boundedPreviewTimingDuration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(Math.min(MAX_DURATION_MS, value) * 10) / 10;
}

/** Standards-compatible, numeric-only Server-Timing values. Metric names are
 * compile-time constants; descriptions and correlation identifiers are never
 * serialized into a browser-visible response header. */
export function previewServerTimingHeader(
  entries: readonly Readonly<{name: string; durationMs: unknown}>[],
): string {
  return entries.flatMap(entry => {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(entry.name)) return [];
    const duration = boundedPreviewTimingDuration(entry.durationMs);
    return duration === null ? [] : [`${entry.name};dur=${duration.toFixed(1)}`];
  }).join(", ");
}

/** Browser-only bounded diagnostics. This emits one User Timing measure per
 * category for DevTools and keeps at most 64 sanitized in-memory entries. */
export function recordPreviewBrowserTiming(entry: PreviewBrowserTimingEntry): void {
  const duration = entry.durationMs === undefined
    ? undefined : boundedPreviewTimingDuration(entry.durationMs) ?? undefined;
  const safe: PreviewBrowserTimingEntry = duration === undefined
    ? { stage: entry.stage, kind: entry.kind, outcome: entry.outcome }
    : { stage: entry.stage, kind: entry.kind, outcome: entry.outcome, durationMs: duration };
  browserEntries.push(safe);
  if (browserEntries.length > MAX_BROWSER_ENTRIES)
    browserEntries.splice(0, browserEntries.length - MAX_BROWSER_ENTRIES);
  if (duration === undefined || typeof performance === "undefined" ||
      typeof performance.measure !== "function") return;
  const name = `zoebuild.preview.${entry.kind}.${entry.stage}.${entry.outcome}`;
  try {
    performance.clearMeasures(name);
    performance.measure(name, { start: 0, duration });
  } catch {
    // User Timing is diagnostic only and must never change preview control flow.
  }
}

export function previewBrowserTimingSnapshot(): readonly PreviewBrowserTimingEntry[] {
  return browserEntries.map(entry => ({ ...entry }));
}

export function resetPreviewBrowserTimingForTests(): void {
  browserEntries.splice(0);
}
