import { createHash } from "crypto";
import { PracticeKind } from "@zoeskoul/db";

export type ReviewExercisePurpose = "quiz" | "project";

export function normalizeReviewExercisePurpose(
    value: unknown,
    kind?: unknown,
    fallback?: ReviewExercisePurpose | null,
): ReviewExercisePurpose | null {
    const raw = String(value ?? "").trim().toLowerCase();
    const normalizedKind = String(kind ?? "").trim();

    if (raw === "quiz") return "quiz";
    if (raw === "project" || raw === "try_it" || raw === "try-it" || raw === "practice" || raw === "capstone") {
        return "project";
    }

    if (!raw) {
        if (normalizedKind === "code_input") return "project";
        return fallback ?? null;
    }

    return null;
}

export type PoolItem = {
    key: string;
    w: number;
    kind?: string | null;
    purpose?: string | null;
};

type IntRng = {
    int(min: number, max: number): number;
};

export function shortHash(s: string) {
    return createHash("sha1").update(s).digest("hex").slice(0, 10);
}

export function stableJsonHash(v: unknown) {
    return shortHash(JSON.stringify(v ?? null));
}

function normalizePurpose(
    value: unknown,
    kind?: unknown,
    fallback: ReviewExercisePurpose = "quiz",
): ReviewExercisePurpose | null {
    return normalizeReviewExercisePurpose(value, kind, fallback);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : null;
}

export function readPoolFromTopicMeta(meta: unknown): PoolItem[] {
    const raw = asRecord(meta)?.pool;
    if (!Array.isArray(raw)) return [];

    return raw
        .map((value) => {
            const item = asRecord(value);

            return {
                key: String(item?.key ?? "").trim(),
                w: Math.max(0, Math.floor(Number(item?.w ?? 0))),
                kind: item?.kind ? String(item.kind).trim() : undefined,
            // Legacy DB rows may be missing purpose; keep those quiz-safe and
            // rely on curriculum sync to refresh stale PracticeTopic.meta.pool.
                purpose: normalizeReviewExercisePurpose(item?.purpose, item?.kind, item?.kind === "code_input" ? "project" : "quiz") ?? "quiz",
            };
        })
        .filter((p) => p.key && Number.isFinite(p.w) && p.w > 0);
}

export function filterPoolByPurpose(
    pool: PoolItem[],
    purpose: string | null | undefined,
) {
    if (!purpose) return pool;

    const wanted = normalizePurpose(purpose, null, "quiz");
    if (!wanted) return [];

    return pool.filter((p) => normalizePurpose(p.purpose, p.kind, "quiz") === wanted);
}

export function filterPoolByPreferKind(
    pool: PoolItem[],
    preferKind: PracticeKind | null | undefined,
) {
    if (!preferKind) return pool;

    const wanted = String(preferKind);
    return pool.filter((p) => !p.kind || String(p.kind) === wanted);
}

export function filterPoolForPurposeAndKind(
    pool: PoolItem[],
    purpose: string | null | undefined,
    preferKind: PracticeKind | null | undefined,
) {
    return filterPoolByPreferKind(filterPoolByPurpose(pool, purpose), preferKind);
}

export function weightedPickKey(rng: IntRng, pool: PoolItem[]) {
    const total = pool.reduce((sum, p) => sum + p.w, 0);
    if (total <= 0) return null;

    let r = rng.int(1, total);

    for (const p of pool) {
        r -= p.w;
        if (r <= 0) return p.key;
    }

    return pool[pool.length - 1]?.key ?? null;
}

export function pickUniqueExerciseKey(
    rng: IntRng,
    pool: PoolItem[],
    used: Set<string>,
) {
    const remaining = pool.filter((p) => !used.has(p.key));
    if (!remaining.length) return null;

    const key = weightedPickKey(rng, remaining);
    if (!key) return null;

    used.add(key);
    return key;
}

export function shuffleInPlace<T>(rng: IntRng, arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function pickTopicsForQuizPreferUnique(
    rng: IntRng,
    slugs: string[],
    n: number,
) {
    const unique = Array.from(new Set(slugs));
    if (!unique.length) return [];

    shuffleInPlace(rng, unique);

    const out = unique.slice(0, Math.min(n, unique.length));
    let k = 0;

    while (out.length < n) {
        out.push(unique[k++ % unique.length]);
    }

    return out;
}
