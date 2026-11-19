import { lstatSync } from "node:fs";

// Operator-mounted directory, read-only inside the Runner. Never mount this
// directory into customer executors. Missing marker means CLOSED in managed mode.
export const ZOEBUILD_ADMISSION_MARKER = "/run/zoebuild-preview-admission/open";
export class ZoebuildPreviewMaintenanceError extends Error {
  constructor() { super("ZoeBuild preview admission is closed."); this.name = "ZoebuildPreviewMaintenanceError"; }
}

/** Legacy installations remain compatible until the operator opts in.
 * Once configured, malformed configuration and missing/unsafe marker fail closed.
 * No HTTP request can choose the path or change the state. Check on every admission,
 * not at module initialization. Existing operations may finish; cancellation stays open.
 */
export function assertZoebuildPreviewAdmissionOpen(
  managed = process.env.ZOEBUILD_PREVIEW_MANAGED_ADMISSION_ENABLED,
  marker = ZOEBUILD_ADMISSION_MARKER,
): void {
  if (managed === undefined || managed === "false") return;
  if (managed !== "true") throw new ZoebuildPreviewMaintenanceError();
  try {
    const entry = lstatSync(marker);
    if (entry.isFile() && entry.nlink === 1 && entry.size === 0) return;
  } catch { /* A missing/unreadable marker never permits admission. */ }
  throw new ZoebuildPreviewMaintenanceError();
}
