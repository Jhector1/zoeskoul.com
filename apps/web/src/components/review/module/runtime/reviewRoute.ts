import type { ReviewCard, ReviewModule, ReviewModuleSection } from "@/lib/subjects/types";
import { getExerciseStateKey } from "./exerciseKeys";
import { resolveManifestExercise } from "@/lib/curriculum/resolveManifestExercise";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";

export type ReviewResolvedRouteTarget =
    | {
        kind: "card";
        sectionSlug: string;
        topicId: string;
        topicSlug: string;
        cardId: string;
        cardType: ReviewCard["type"];
        targetKind: string;
        targetSlug: string;
    }
    | {
        kind: "exercise";
        sectionSlug: string;
        topicId: string;
        topicSlug: string;
        cardId: string;
        cardType: ReviewCard["type"];
        targetKind: "exercise";
        targetSlug: string;
        exerciseId: string;
        exerciseStateKey: string;
    };

type ReviewCardRouteTarget = Extract<ReviewResolvedRouteTarget, { kind: "card" }>;
type ReviewExerciseRouteTarget = Extract<ReviewResolvedRouteTarget, { kind: "exercise" }>;

type TopicLookup = {
    sectionSlug: string;
    topic: ReviewModule["topics"][number];
};

type RouteTopicManifest = {
    exercises?: unknown[];
    topicId?: string;
} | null;

function cleanSegment(value: unknown, fallback = "item") {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return fallback;
    return raw
        .replace(/\./g, "-")
        .replace(/_/g, "-")
        .replace(/[^a-zA-Z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || fallback;
}

function lastIdSegment(value: unknown) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    const parts = raw.split(/[.:/]/).filter(Boolean);
    return parts[parts.length - 1] ?? raw;
}

function getCardTargetKind(card: ReviewCard) {
    switch (card.type) {
        case "sketch":
        case "quiz":
        case "project":
        case "text":
        case "video":
            return card.type;
        default:
            return "card";
    }
}

function getCardTargetSlug(card: ReviewCard) {
    if (card.type === "sketch") {
        return cleanSegment(lastIdSegment(card.sketchId), cleanSegment(card.id, "sketch"));
    }

    return cleanSegment(card.id, "card");
}

function getTopicRouteSlug(topicId: string) {
    return cleanSegment(topicId, "topic");
}

function getRouteTopicManifest(args: {
    subjectSlug: string;
    topicId: string;
    topic: ReviewModule["topics"][number] | null | undefined;
}): RouteTopicManifest {
    const rawManifest =
        args.topic?.meta && typeof args.topic.meta === "object"
            ? ((args.topic.meta as { rawManifest?: RouteTopicManifest }).rawManifest ?? null)
            : null;

    if (rawManifest) return rawManifest;

    return resolveTopicBundleManifest({
        subjectSlug: args.subjectSlug,
        topicSlugOrId: args.topicId,
    });
}

function getTopicLookup(mod: ReviewModule): Map<string, TopicLookup> {
    const map = new Map<string, TopicLookup>();

    const sections = Array.isArray(mod.sections) ? mod.sections : [];
    for (const section of sections) {
        const topics = Array.isArray(section.topics) ? section.topics : [];
        for (const topic of topics) {
            map.set(topic.id, {
                sectionSlug: section.slug,
                topic,
            });
        }
    }

    const flatTopics = Array.isArray(mod.topics) ? mod.topics : [];
    for (const topic of flatTopics) {
        if (!map.has(topic.id)) {
            map.set(topic.id, {
                sectionSlug: "general",
                topic,
            });
        }
    }

    return map;
}

function getProjectExerciseEntries(
    card: Extract<ReviewCard, { type: "project" }>,
    topicManifest?: { exercises?: unknown[]; topicId?: string } | null,
    options?: { strictManifestExerciseMatch?: boolean },
) {
    const rawManifestExercises = Array.isArray(topicManifest?.exercises)
        ? topicManifest.exercises
        : [];

    const steps = Array.isArray(card.spec?.steps) ? card.spec.steps : [];
    return steps.map((step) => {
        const exerciseId =
            typeof step?.exerciseKey === "string" && step.exerciseKey.trim()
                ? step.exerciseKey.trim()
                : "";

        if (!exerciseId) {
            throw new Error(
                `Project step "${String(step?.id ?? "unknown")}" is missing exerciseKey.`,
            );
        }

        const manifestExercise = rawManifestExercises.length
            ? rawManifestExercises.find((candidate) => {
                const candidateRecord =
                    typeof candidate === "object" && candidate !== null
                        ? (candidate as { id?: unknown })
                        : null;
                return typeof candidateRecord?.id === "string" && candidateRecord.id.trim() === exerciseId;
            })
            : null;

        if (options?.strictManifestExerciseMatch !== false) {
            resolveManifestExercise({
                topicBundle: topicManifest,
                exerciseKey: exerciseId,
            });
        }

        const manifestExerciseIndex = manifestExercise
            ? rawManifestExercises.indexOf(manifestExercise)
            : -1;

        const routeAliases =
            manifestExerciseIndex >= 0
                ? [
                    `q${manifestExerciseIndex + 1}`,
                    `quiz${manifestExerciseIndex + 1}`,
                ]
                : [];

        return {
            exerciseId,
            routeSlug: cleanSegment(
                typeof step?.id === "string" && step.id.trim() ? step.id : exerciseId,
                "exercise",
            ),
            routeAliases: routeAliases.map((alias) => cleanSegment(alias, "exercise")),
        };
    }).filter((entry) => entry.exerciseId);
}

export function buildDefaultReviewRouteTarget(mod: ReviewModule): ReviewResolvedRouteTarget | null {
    const topicMap = getTopicLookup(mod);

    for (const topic of mod.topics ?? []) {
        const lookup = topicMap.get(topic.id);
        const sectionSlug = lookup?.sectionSlug ?? "general";
        const card = Array.isArray(topic.cards) ? topic.cards[0] : null;
        if (!card) continue;

        return {
            kind: "card",
            sectionSlug,
            topicId: topic.id,
            topicSlug: getTopicRouteSlug(topic.id),
            cardId: card.id,
            cardType: card.type,
            targetKind: getCardTargetKind(card),
            targetSlug: getCardTargetSlug(card),
        };
    }

    return null;
}

export function resolveReviewRouteTarget(args: {
    mod: ReviewModule;
    subjectSlug: string;
    moduleSlug: string;
    route: {
        sectionSlug?: string | null;
        topicId?: string | null;
        topicSlug?: string | null;
        targetKind?: string | null;
        targetSlug?: string | null;
    };
}): ReviewResolvedRouteTarget | null {
    const { mod, subjectSlug, moduleSlug, route } = args;
    const topicMap = getTopicLookup(mod);

    const topicSegment =
        typeof route.topicSlug === "string" && route.topicSlug
            ? route.topicSlug
            : typeof route.topicId === "string"
                ? route.topicId
                : "";
    const targetKind = typeof route.targetKind === "string" ? route.targetKind : "";
    const targetSlug = cleanSegment(route.targetSlug, "");
    const hasExplicitRoute =
        Boolean(topicSegment) &&
        Boolean(targetKind) &&
        Boolean(targetSlug);

    if (!hasExplicitRoute) {
        return buildDefaultReviewRouteTarget(mod);
    }

    const topicId =
        Array.from(topicMap.keys()).find(
            (candidate) => getTopicRouteSlug(candidate) === cleanSegment(topicSegment, ""),
        ) ?? topicSegment;

    const lookup = topicMap.get(topicId);
    if (!lookup) return null;

    const sectionSlug = lookup.sectionSlug;
    const cards = Array.isArray(lookup.topic.cards) ? lookup.topic.cards : [];

    if (targetKind === "exercise") {
        const topicManifest =
            getRouteTopicManifest({
                subjectSlug,
                topicId,
                topic: lookup.topic,
            });
        const hasExplicitRawManifest = Boolean(
            lookup.topic?.meta &&
            typeof lookup.topic.meta === "object" &&
            "rawManifest" in lookup.topic.meta,
        );

        for (const card of cards) {
            if (card.type !== "project") continue;
            for (const entry of getProjectExerciseEntries(card, topicManifest, {
                strictManifestExerciseMatch: hasExplicitRawManifest,
            })) {
                const matchesLegacyAlias =
                    Array.isArray(entry.routeAliases) &&
                    entry.routeAliases.some((alias) => alias === targetSlug);
                if (entry.routeSlug !== targetSlug && !matchesLegacyAlias) continue;
                const routeExerciseId = matchesLegacyAlias ? targetSlug : entry.exerciseId;
                return {
                    kind: "exercise" as const,
                    sectionSlug,
                    topicId,
                    topicSlug: getTopicRouteSlug(topicId),
                    cardId: card.id,
                    cardType: card.type,
                    targetKind: "exercise" as const,
                    targetSlug,
                    exerciseId: routeExerciseId,
                    exerciseStateKey: getExerciseStateKey(
                        {
                            subjectSlug,
                            moduleSlug,
                            sectionSlug,
                            topicId,
                            cardId: card.id,
                        },
                        routeExerciseId,
                    ),
                };
            }
        }
    }

    for (const card of cards) {
        if (getCardTargetKind(card) !== targetKind) continue;
        if (getCardTargetSlug(card) !== targetSlug) continue;
        return {
            kind: "card",
            sectionSlug,
            topicId,
            topicSlug: getTopicRouteSlug(topicId),
            cardId: card.id,
            cardType: card.type,
            targetKind,
            targetSlug,
        };
    }

    return null;
}

export function buildReviewRoutePath(args: {
    locale: string;
    catalogSlug?: string | null;
    subjectSlug: string;
    moduleSlug: string;
    target: ReviewResolvedRouteTarget;
}) {
    const { locale, catalogSlug, subjectSlug, moduleSlug, target } = args;
    const catalogPrefix = catalogSlug
        ? `/catalog/${encodeURIComponent(cleanSegment(catalogSlug, "general"))}`
        : "";
    return `/${encodeURIComponent(cleanSegment(locale, "en"))}${catalogPrefix}/subjects/${encodeURIComponent(subjectSlug)}/modules/${encodeURIComponent(moduleSlug)}/learn/${encodeURIComponent(target.sectionSlug)}/${encodeURIComponent(target.topicSlug)}/${encodeURIComponent(target.targetKind)}/${encodeURIComponent(target.targetSlug)}`;
}

export function parseReviewRouteFromPath(args: {
    pathname: string;
    locale: string;
    catalogSlug?: string | null;
    subjectSlug: string;
    moduleSlug: string;
}) {
    const { pathname, locale, catalogSlug, subjectSlug, moduleSlug } = args;
    const parts = pathname.split("/").filter(Boolean).map((part) => {
        try {
            return decodeURIComponent(part);
        } catch {
            return part;
        }
    });

    const expectedCatalogPrefix = catalogSlug
        ? [
            cleanSegment(locale, "en"),
            "catalog",
            cleanSegment(catalogSlug, "general"),
            "subjects",
            subjectSlug,
            "modules",
            moduleSlug,
            "learn",
        ]
        : null;

    const expectedPlainPrefix = [
        cleanSegment(locale, "en"),
        "subjects",
        subjectSlug,
        "modules",
        moduleSlug,
        "learn",
    ];

    const activePrefix =
        expectedCatalogPrefix &&
        expectedCatalogPrefix.every((part, index) => parts[index] === part)
            ? expectedCatalogPrefix
            : expectedPlainPrefix.every((part, index) => parts[index] === part)
                ? expectedPlainPrefix
                : null;

    if (!activePrefix) return null;
    const baseIndex = activePrefix.length;

    return {
        sectionSlug: parts[baseIndex] ?? null,
        topicSlug: parts[baseIndex + 1] ?? null,
        targetKind: parts[baseIndex + 2] ?? null,
        targetSlug: parts[baseIndex + 3] ?? null,
    };
}

export function buildReviewCardRouteTarget(args: {
    mod: ReviewModule;
    topicId: string;
    card: ReviewCard;
}): ReviewCardRouteTarget {
    const lookup = getTopicLookup(args.mod).get(args.topicId);
    const sectionSlug = lookup?.sectionSlug ?? "general";

    return {
        kind: "card" as const,
        sectionSlug,
        topicId: args.topicId,
        topicSlug: getTopicRouteSlug(args.topicId),
        cardId: args.card.id,
        cardType: args.card.type,
        targetKind: getCardTargetKind(args.card),
        targetSlug: getCardTargetSlug(args.card),
    };
}

export function buildReviewExerciseRouteTarget(args: {
    mod: ReviewModule;
    topicId: string;
    cardId: string;
    exerciseId: string;
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug?: string;
}): ReviewExerciseRouteTarget {
    const lookup = getTopicLookup(args.mod).get(args.topicId);
    const sectionSlug = args.sectionSlug ?? lookup?.sectionSlug ?? "general";
    const topic = lookup?.topic ?? null;
    const card = (topic?.cards ?? []).find((item) => item.id === args.cardId) ?? null;
    const topicManifest = getRouteTopicManifest({
        subjectSlug: args.subjectSlug,
        topicId: args.topicId,
        topic,
    });
    const hasExplicitRawManifest = Boolean(
        topic?.meta &&
        typeof topic.meta === "object" &&
        "rawManifest" in topic.meta,
    );
    const rawExerciseId = typeof args.exerciseId === "string" ? args.exerciseId.trim() : "";
    const exerciseToken = lastIdSegment(rawExerciseId);
    const projectCard = card?.type === "project" ? card : null;
    const matchedStep = projectCard
        ? getProjectExerciseEntries(projectCard, topicManifest, {
            strictManifestExerciseMatch: hasExplicitRawManifest,
        }).find((entry) =>
            entry.exerciseId === rawExerciseId ||
            entry.exerciseId === exerciseToken ||
            cleanSegment(entry.exerciseId, "exercise") === cleanSegment(exerciseToken, "exercise") ||
            cleanSegment(entry.routeSlug, "exercise") === cleanSegment(exerciseToken, "exercise") ||
            entry.routeAliases?.some(
                (alias) => cleanSegment(alias, "exercise") === cleanSegment(exerciseToken, "exercise"),
            ),
        ) ?? null
        : null;
    const matchedLegacyAlias = matchedStep?.routeAliases?.some(
        (alias) => cleanSegment(alias, "exercise") === cleanSegment(exerciseToken, "exercise"),
    ) ?? false;
    const canonicalExerciseId = matchedStep?.exerciseId ?? exerciseToken ?? rawExerciseId;
    const routeExerciseId =
        matchedStep && matchedLegacyAlias
            ? exerciseToken || rawExerciseId
            : canonicalExerciseId;
    const routeSlug =
        matchedStep && !matchedLegacyAlias
            ? matchedStep.routeSlug
            : cleanSegment(exerciseToken || rawExerciseId, "exercise");

    return {
        kind: "exercise" as const,
        sectionSlug,
        topicId: args.topicId,
        topicSlug: getTopicRouteSlug(args.topicId),
        cardId: args.cardId,
        cardType: card?.type ?? "project",
        targetKind: "exercise" as const,
        targetSlug: routeSlug,
        exerciseId: routeExerciseId,
        exerciseStateKey: getExerciseStateKey(
            {
                subjectSlug: args.subjectSlug,
                moduleSlug: args.moduleSlug,
                sectionSlug,
                topicId: args.topicId,
                cardId: args.cardId,
            },
            routeExerciseId,
        ),
    };
}

export function getReviewTopicSectionSlugMap(
    sections: ReviewModule["sections"] | undefined,
) {
    const out = new Map<string, string>();
    const safeSections = Array.isArray(sections) ? sections : [];
    for (const section of safeSections as ReviewModuleSection[]) {
        const topics = Array.isArray(section.topics) ? section.topics : [];
        for (const topic of topics) {
            out.set(topic.id, section.slug);
        }
    }
    return out;
}
