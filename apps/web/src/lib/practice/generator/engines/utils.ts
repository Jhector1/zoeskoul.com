import type { PracticeKind } from "@prisma/client";

import type { RNG } from "@/lib/practice/generator/shared/rng";
import type { GenOut } from "@/lib/practice/generator/shared/expected";
import type { TopicContext } from "@/lib/practice/generator/generatorTypes";
import type {
    CodeInputExercise,
    CodeLanguage,
    Difficulty,
    ExerciseKind,
    MultiChoiceExercise,
    SingleChoiceExercise,
} from "@/lib/practice/types";

export type PracticePurpose = "quiz" | "project";

/* -------------------------------------------------------------------------- */
/* output / handler types                                                     */
/* -------------------------------------------------------------------------- */

export type AnyGenOut = {
    [K in ExerciseKind]: GenOut<K>;
}[ExerciseKind];

export type GeneratorOut = AnyGenOut & {
    meta?: Record<string, unknown>;
};

export type HandlerArgs = {
    rng: RNG;
    diff: Difficulty;
    id: string;
    topic: string;
    ctx: TopicContext;
};

export type Handler<K extends ExerciseKind = ExerciseKind> = (
    args: HandlerArgs,
) => GenOut<K>;

export type AnyHandler = (args: HandlerArgs) => AnyGenOut;

export type SubjectModuleGenerator = (
    rng: RNG,
    diff: Difficulty,
    id: string,
) => GeneratorOut;

/* -------------------------------------------------------------------------- */
/* pool types                                                                 */
/* -------------------------------------------------------------------------- */

export type PoolItem = {
    key: string;
    w: number;
    kind?: ExerciseKind | PracticeKind;
    purpose?: PracticePurpose;
};

export type TopicBundle = {
    slug: string;
    pool: readonly PoolItem[];
    handlers: Readonly<Record<string, AnyHandler>>;
};

/* -------------------------------------------------------------------------- */
/* basic helpers                                                              */
/* -------------------------------------------------------------------------- */

const DEFAULT_NAMES = [
    "alex",
    "sam",
    "jordan",
    "taylor",
    "maria",
    "leo",
    "maya",
] as const;

export function parseTopicSlug(raw: string) {
    const s = String(raw ?? "").trim();
    const parts = s.split(".").filter(Boolean);
    const base = parts.length ? parts[parts.length - 1] : s;
    const prefix = parts.length > 1 ? parts[0] : null;
    return { raw: s, base, prefix };
}

export function readPoolFromMeta(meta: unknown): PoolItem[] {
    const pool = (meta as { pool?: unknown[] } | null | undefined)?.pool;
    if (!Array.isArray(pool)) return [];

    return pool
        .map((p) => {
            const item = p as {
                key?: unknown;
                w?: unknown;
                kind?: unknown;
                purpose?: unknown;
            };

            return {
                key: String(item?.key ?? "").trim(),
                w: Number(item?.w ?? 0),
                kind: item?.kind
                    ? (String(item.kind).trim() as ExerciseKind | PracticeKind)
                    : undefined,
                purpose: item?.purpose
                    ? (String(item.purpose).trim() as PracticePurpose)
                    : undefined,
            };
        })
        .filter((p) => p.key && Number.isFinite(p.w) && p.w > 0);
}

export function weightedKey(rng: RNG, pool: readonly PoolItem[]): string {
    if (!Array.isArray(pool) || pool.length === 0) {
        const err = new Error("weightedKey() called with empty pool.");
        (err as { code?: string }).code = "EMPTY_POOL";
        throw err;
    }

    const picked = rng.weighted(pool.map((p) => ({ value: p.key, w: p.w })));
    return String(picked);
}

export function safeInt(rng: RNG, lo: number, hi: number) {
    return rng.int(lo, hi);
}

export function pickName(rng: RNG) {
    return rng.pick(DEFAULT_NAMES);
}

export function pickDifferentName(rng: RNG, avoid: string) {
    let x = pickName(rng);
    for (let i = 0; i < 6 && x === avoid; i++) x = pickName(rng);
    return x;
}

export function pickDifferentInt(
    rng: RNG,
    lo: number,
    hi: number,
    avoid: number,
) {
    let x = safeInt(rng, lo, hi);
    for (let i = 0; i < 6 && x === avoid; i++) x = safeInt(rng, lo, hi);
    return x;
}

/* -------------------------------------------------------------------------- */
/* expected helpers                                                           */
/* -------------------------------------------------------------------------- */

export type Opt = { id: string; text: string };

export type DragExpected = { kind: "drag_reorder"; tokenIds: string[] };
export type MultiExpected = { kind: "multi_choice"; optionIds: string[] };
export type TextExpected = {
    kind: "text_input";
    answers: string[];
    match?: "exact" | "includes";
};

export function makeTextExpected(
    answers: string[],
    match: "exact" | "includes" = "includes",
): TextExpected {
    return { kind: "text_input", answers, match };
}

export function makeDragExpected(tokenIds: string[]): DragExpected {
    return { kind: "drag_reorder", tokenIds };
}

export function makeMultiExpected(optionIds: string[]): MultiExpected {
    return { kind: "multi_choice", optionIds };
}

/* -------------------------------------------------------------------------- */
/* output builders                                                            */
/* -------------------------------------------------------------------------- */

export function makeSingleChoiceOut(args: {
    archetype: string;
    id: string;
    topic: string;
    diff: Difficulty;
    title: string;
    prompt: string;
    options: Array<{ id: string; text: string }>;
    answerOptionId: string;
    hint?: string;
}): GenOut<"single_choice"> {
    const exercise: SingleChoiceExercise = {
        id: args.id,
        topic: args.topic,
        difficulty: args.diff,
        kind: "single_choice",
        title: args.title,
        prompt: args.prompt,
        options: args.options,
        ...(args.hint ? { hint: args.hint } : {}),
    };

    return {
        archetype: args.archetype,
        exercise,
        expected: {
            kind: "single_choice",
            optionId: args.answerOptionId,
        } as GenOut<"single_choice">["expected"],
    };
}

export function makeMultiChoiceOut(args: {
    archetype: string;
    id: string;
    topic: string;
    diff: Difficulty;
    title: string;
    prompt: string;
    options: Opt[];
    answerOptionIds: string[];
    hint?: string;
}): GenOut<"multi_choice"> {
    const exercise: MultiChoiceExercise = {
        id: args.id,
        topic: args.topic,
        difficulty: args.diff,
        kind: "multi_choice",
        title: args.title,
        prompt: args.prompt,
        options: args.options,
        ...(args.hint ? { hint: args.hint } : {}),
    };

    return {
        archetype: args.archetype,
        exercise,
        expected: makeMultiExpected(
            args.answerOptionIds,
        ) as GenOut<"multi_choice">["expected"],
    };
}

export function makeCodeInputOut(args: {
    archetype: string;
    id: string;
    topic: string;
    diff: Difficulty;
    title: string;
    prompt: string;
    starterCode: string;
    language?: CodeLanguage;
    expected: GenOut<"code_input">["expected"];
    hint?: string;
    editorHeight?: number;
    allowLanguageSwitch?: boolean;
    stdinHint?: string;
    examples?: Array<{ stdin?: string; stdout: string }>;
}): GenOut<"code_input"> {
    const exercise: CodeInputExercise = {
        id: args.id,
        topic: args.topic,
        difficulty: args.diff,
        kind: "code_input",
        title: args.title,
        prompt: args.prompt,
        language: args.language ?? "python",
        starterCode: args.starterCode,
        ...(args.hint ? { hint: args.hint } : {}),
        ...(args.editorHeight != null ? { editorHeight: args.editorHeight } : {}),
        ...(args.allowLanguageSwitch != null
            ? { allowLanguageSwitch: args.allowLanguageSwitch }
            : {}),
        ...(args.stdinHint ? { stdinHint: args.stdinHint } : {}),
        ...(args.examples ? { examples: args.examples } : {}),
    };

    return {
        archetype: args.archetype,
        exercise,
        expected: args.expected,
    };
}

/* -------------------------------------------------------------------------- */
/* topic bundle helpers                                                       */
/* -------------------------------------------------------------------------- */

export function defineTopic(
    slug: string,
    pool: readonly PoolItem[],
    handlers: Record<string, AnyHandler>,
): TopicBundle {
    return { slug, pool, handlers };
}

/* -------------------------------------------------------------------------- */
/* exclusion helpers                                                          */
/* -------------------------------------------------------------------------- */

function toKeySet(v: unknown): Set<string> {
    const out = new Set<string>();
    if (Array.isArray(v)) {
        for (const x of v) out.add(String(x));
    }
    return out;
}

export function normalizeExcludedKeys(ctx: TopicContext): Set<string> {
    const anyCtx = ctx as {
        excludedKeys?: unknown[];
        seenKeys?: unknown[];
        usedKeys?: unknown[];
        meta?: {
            excludedKeys?: unknown[];
            seenKeys?: unknown[];
        };
        history?: Array<{ archetype?: unknown; key?: unknown }>;
    };

    const s = new Set<string>();

    for (const k of toKeySet(anyCtx.excludedKeys)) s.add(k);
    for (const k of toKeySet(anyCtx.seenKeys)) s.add(k);
    for (const k of toKeySet(anyCtx.usedKeys)) s.add(k);

    for (const k of toKeySet(anyCtx.meta?.excludedKeys)) s.add(k);
    for (const k of toKeySet(anyCtx.meta?.seenKeys)) s.add(k);

    const hist = anyCtx.history;
    if (Array.isArray(hist)) {
        for (const h of hist) {
            if (h?.archetype) s.add(String(h.archetype));
            if (h?.key) s.add(String(h.key));
        }
    }

    return s;
}

export function filterExcluded(
    pool: readonly PoolItem[],
    excluded: Set<string>,
): PoolItem[] {
    if (!excluded.size) return [...pool];
    return pool.filter((p) => !excluded.has(p.key));
}

/* -------------------------------------------------------------------------- */
/* generator helpers                                                          */
/* -------------------------------------------------------------------------- */

function normalizePurpose(p?: PracticePurpose | null): PracticePurpose {
    return p === "project" || p === "quiz" ? p : "quiz";
}

function safeMixedPoolFor(
    validKeys: string[],
    defaultPurpose: PracticePurpose,
): PoolItem[] {
    return validKeys.map((key) => ({ key, w: 1, purpose: defaultPurpose }));
}

function bundleKey(slug: string) {
    return parseTopicSlug(slug).base || slug;
}

export function makeSubjectModuleGenerator(args: {
    engineName: string;
    ctx: TopicContext;
    topics: readonly TopicBundle[];
    defaultPurpose?: PracticePurpose;
    enablePurpose?: boolean;
}): SubjectModuleGenerator {
    const topicHandlers: Record<string, Record<string, AnyHandler>> =
        Object.fromEntries(args.topics.map((t) => [bundleKey(t.slug), t.handlers]));

    const topicValidKeys: Record<string, string[]> = Object.fromEntries(
        args.topics.map((t) => [bundleKey(t.slug), t.pool.map((p) => p.key)]),
    );

    const topicDefaultPools: Record<string, PoolItem[]> = Object.fromEntries(
        args.topics.map((t) => [bundleKey(t.slug), t.pool.map((p) => ({ ...p }))]),
    );

    return makeSubjectTopicGenerator({
        engineName: args.engineName,
        ctx: args.ctx,
        topicHandlers,
        topicValidKeys,
        topicDefaultPools,
        defaultPurpose: args.defaultPurpose ?? "quiz",
        enablePurpose: args.enablePurpose ?? true,
    });
}

export function makeSubjectTopicGenerator(args: {
    engineName: string;
    ctx: TopicContext;
    topicHandlers: Record<string, Record<string, AnyHandler>>;
    topicValidKeys: Record<string, string[]>;
    topicDefaultPools?: Record<string, PoolItem[]>;
    defaultPurpose?: PracticePurpose;
    enablePurpose?: boolean;
}): SubjectModuleGenerator {
    const {
        engineName,
        ctx,
        topicHandlers,
        topicValidKeys,
        topicDefaultPools,
        defaultPurpose = "quiz",
        enablePurpose = true,
    } = args;

    return (rng: RNG, diff: Difficulty, id: string): GeneratorOut => {
        const R: RNG = ((ctx as unknown as { rng?: RNG }).rng ?? rng) as RNG;

        const rawTopicSlug = String(
            (ctx as unknown as { topicSlug?: string }).topicSlug ?? "",
        );
        const { raw: topicSlugRaw, base: topicSlugBase } = parseTopicSlug(rawTopicSlug);
        const topic = topicSlugRaw;

        const handlers = topicHandlers[topicSlugBase];
        const validKeys = topicValidKeys[topicSlugBase];

        if (!handlers || !validKeys?.length) {
            const err = new Error(
                `${engineName}: unknown topicSlug="${topicSlugRaw}" (base="${topicSlugBase}") valid=[${Object.keys(
                    topicHandlers,
                ).join(", ")}]`,
            );
            (err as { code?: string }).code = "UNKNOWN_TOPIC";
            throw err;
        }

        const metaPoolRaw = readPoolFromMeta(
            (ctx as unknown as { meta?: unknown }).meta,
        ).filter((p) => validKeys.includes(p.key));

        const fallbackPoolRaw = (topicDefaultPools?.[topicSlugBase] ?? []).filter((p) =>
            validKeys.includes(p.key),
        );

        const anyCtx = ctx as unknown as {
            preferKind?: unknown;
            preferPurpose?: unknown;
            exerciseKey?: unknown;
            meta?: {
                preferKind?: unknown;
                preferPurpose?: unknown;
                forceKey?: unknown;
            };
        };

        const preferKindRaw = anyCtx.preferKind ?? anyCtx.meta?.preferKind ?? null;
        const preferPurposeRaw =
            anyCtx.preferPurpose ?? anyCtx.meta?.preferPurpose ?? null;

        const preferKind = preferKindRaw
            ? (String(preferKindRaw).trim() as ExerciseKind | PracticeKind)
            : null;

        const preferPurpose =
            enablePurpose && preferPurposeRaw
                ? normalizePurpose(String(preferPurposeRaw).trim() as PracticePurpose)
                : null;

        const applyFilters = (base: PoolItem[]) => {
            const kindFiltered = preferKind
                ? base.filter((p) => !p.kind || String(p.kind) === String(preferKind))
                : base;

            const purposeFiltered = preferPurpose
                ? kindFiltered.filter(
                    (p) => normalizePurpose(p.purpose ?? defaultPurpose) === preferPurpose,
                )
                : kindFiltered;

            return purposeFiltered;
        };

        let basePool =
            metaPoolRaw.length > 0
                ? metaPoolRaw
                : fallbackPoolRaw.length > 0
                    ? fallbackPoolRaw
                    : safeMixedPoolFor(validKeys, defaultPurpose);

        let filtered = applyFilters(basePool);

        if (filtered.length === 0 && metaPoolRaw.length > 0 && fallbackPoolRaw.length > 0) {
            basePool = fallbackPoolRaw;
            filtered = applyFilters(basePool);
        }

        if (filtered.length === 0) {
            const err = new Error(
                `${engineName}: NO_QUESTIONS_AVAILABLE topic="${topicSlugRaw}" base="${topicSlugBase}" preferPurpose="${preferPurpose ?? ""}" preferKind="${preferKind ?? ""}"`,
            );
            (err as { code?: string; details?: Record<string, unknown> }).code =
                "NO_QUESTIONS_AVAILABLE";
            (err as { details?: Record<string, unknown> }).details = {
                engineName,
                topicSlugRaw,
                topicSlugBase,
                preferKind,
                preferPurpose,
                metaPoolCount: metaPoolRaw.length,
                fallbackPoolCount: fallbackPoolRaw.length,
                validKeysCount: validKeys.length,
            };
            throw err;
        }

        const excluded = normalizeExcludedKeys(ctx);
        const uniq = filterExcluded(filtered, excluded);
        const pool = uniq.length ? uniq : filtered;

        if (!pool.length) {
            const err = new Error(
                `${engineName}: EMPTY_POOL topic="${topicSlugRaw}" base="${topicSlugBase}" preferPurpose="${preferPurpose ?? ""}" preferKind="${preferKind ?? ""}"`,
            );
            (err as { code?: string }).code = "EMPTY_POOL";
            throw err;
        }

        const forceKey = String(anyCtx.meta?.forceKey ?? "").trim();
        const exerciseKey = String(anyCtx.exerciseKey ?? "").trim();

        const forced =
            (exerciseKey && pool.some((p) => p.key === exerciseKey) ? exerciseKey : "") ||
            (forceKey && pool.some((p) => p.key === forceKey) ? forceKey : "");

        const chosen = forced || weightedKey(R, pool);

        const handler = handlers[chosen];
        if (!handler) {
            const err = new Error(
                `${engineName}: missing handler key="${chosen}" topicSlug="${topicSlugRaw}"`,
            );
            (err as { code?: string }).code = "MISSING_HANDLER";
            throw err;
        }

        const chosenItem = pool.find((p) => p.key === chosen) ?? null;
        const chosenPurpose = normalizePurpose(chosenItem?.purpose ?? defaultPurpose);

        const out = handler({ rng: R, diff, id, topic, ctx });

        return {
            ...out,
            meta: {
                ...(typeof (out as { meta?: unknown }).meta === "object" &&
                (out as { meta?: unknown }).meta !== null
                    ? ((out as { meta?: Record<string, unknown> }).meta ?? {})
                    : {}),
                key: chosen,
                purpose: chosenPurpose,
            },
        };
    };
}

export function makeNoGenerator(
    engineName: string,
    topicSlugRaw: string,
): SubjectModuleGenerator {
    return (_rng: RNG, _diff: Difficulty, id: string): GeneratorOut => {
        const err = new Error(
            `${engineName}: no generator registered for topicSlug="${topicSlugRaw}" (exercise id=${id})`,
        );
        (err as { code?: string; topicSlug?: string; engineName?: string }).code =
            "NO_GENERATOR";
        (err as { topicSlug?: string }).topicSlug = topicSlugRaw;
        (err as { engineName?: string }).engineName = engineName;
        throw err;
    };
}