import type { SavedSketchState } from "./types";
import type { SketchSpec } from "./specTypes";

/**
 * Central place for future migrations.
 * For now: if version mismatch, keep data and bump version.
 */
export function migrateSketchState(
    spec: SketchSpec,
    saved: SavedSketchState | null,
): SavedSketchState | null {
    if (!saved) return null;

    const v = saved.version ?? 0;
    if (v === spec.specVersion) return saved;

    return {
        ...saved,
        version: spec.specVersion,
        updatedAt: new Date().toISOString(),
    };
}
