/** Reserved admin-owned key on PracticeCatalog/PracticeSubject.meta.
 * Curriculum manifests do not own this key. No extra visibility table is needed.
 */
export const DISCOVERY_HIDDEN_META_KEY = "adminHiddenFromDiscovery" as const;

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>) : null;
}

export function isDiscoveryHidden(meta: unknown): boolean {
    return asRecord(meta)?.[DISCOVERY_HIDDEN_META_KEY] === true;
}

/** A curriculum seed replaces manifest-owned metadata but retains the DB-owned flag.
 * The calling seeder must acquire a row lock before reading old meta and updating it.
 */
export function seedMetaPreservingDiscoveryFlag(seedMeta: unknown, oldMeta: unknown): unknown {
    const seed = asRecord(seedMeta);
    const old = asRecord(oldMeta);
    const saved = old?.[DISCOVERY_HIDDEN_META_KEY];
    if (saved !== true && saved !== false) {
        if (!seed || !(DISCOVERY_HIDDEN_META_KEY in seed)) return seedMeta;
        const clean = { ...seed };
        delete clean[DISCOVERY_HIDDEN_META_KEY];
        return clean;
    }
    const merged = { ...(seed ?? {}) };
    merged[DISCOVERY_HIDDEN_META_KEY] = saved;
    return merged;
}
