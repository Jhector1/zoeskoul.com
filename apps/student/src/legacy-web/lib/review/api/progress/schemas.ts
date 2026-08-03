import { z } from "zod";
import type { ReviewProgressState } from "@/lib/review/progressTypes";
import {
    bytesOfText,
    resolveWorkspacePolicy,
    validateWorkspaceState,
    type IdeWorkspacePolicy,
} from "@/lib/ide/workspacePolicy";
import type { WorkspaceLanguage } from "@/lib/practice/types";

function pickModuleSlug(...values: Array<string | undefined>) {
    for (const value of values) {
        const slug = String(value ?? "").trim();
        if (slug) return slug;
    }
    return "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function asKeys(value: Record<string, unknown>) {
    return Object.keys(value);
}

function normalizeWorkspaceLanguage(value: unknown): WorkspaceLanguage {
    const language = String(value ?? "").trim();
    return language || "python";
}

function reviewWorkspacePolicy(language: unknown): IdeWorkspacePolicy {
    return resolveWorkspacePolicy(
        {
            hasUser: true,
            canUseMultiFile: true,
            canSaveCloud: false,
            canCreateProjects: false,
        },
        normalizeWorkspaceLanguage(language),
    );
}

export const REVIEW_PROGRESS_LIMITS = {
    maxPayloadBytes: 12 * 1024 * 1024,
    maxTopics: 128,
    maxCardsPerTopic: 512,
    maxExercisesPerTopic: 512,
    maxJsonStateBytes: 12 * 1024 * 1024,
    maxCodeFieldBytes: 1 * 1024 * 1024,
    maxStringFieldBytes: 64 * 1024,
};

export function measureReviewProgressPayloadBytes(value: unknown) {
    return bytesOfText(JSON.stringify(value ?? null));
}

function validateBooleanRecord(
    value: unknown,
    path: (string | number)[],
    label: string,
    maxEntries: number,
    ctx: z.RefinementCtx,
) {
    if (value == null) return;
    if (!isPlainObject(value)) {
        ctx.addIssue({
            code: "custom",
            path,
            message: `${label} must be an object.`,
        });
        return;
    }

    const keys = asKeys(value);
    if (keys.length > maxEntries) {
        ctx.addIssue({
            code: "custom",
            path,
            message: `${label} exceeds the ${maxEntries} entry limit.`,
        });
        return;
    }

    for (const key of keys) {
        if (typeof value[key] !== "boolean") {
            ctx.addIssue({
                code: "custom",
                path: [...path, key],
                message: `${label} values must be boolean.`,
            });
        }
    }
}

function validateShortStringField(
    value: unknown,
    path: (string | number)[],
    label: string,
    maxBytes: number,
    ctx: z.RefinementCtx,
) {
    if (value == null) return;
    if (typeof value !== "string") {
        ctx.addIssue({
            code: "custom",
            path,
            message: `${label} must be a string.`,
        });
        return;
    }
    if (bytesOfText(value) > maxBytes) {
        ctx.addIssue({
            code: "custom",
            path,
            message: `${label} exceeds the ${maxBytes} byte limit.`,
        });
    }
}

function validateWorkspaceCarrier(
    value: unknown,
    path: (string | number)[],
    ctx: z.RefinementCtx,
    seenWorkspaces: WeakSet<object>,
) {
    if (value == null) return;
    if (!isPlainObject(value)) {
        ctx.addIssue({
            code: "custom",
            path,
            message: "Expected an object for persisted review workspace state.",
        });
        return;
    }

    for (const key of ["stdin", "codeStdin", "toolStdin"]) {
        if (key in value) {
            validateShortStringField(
                value[key],
                [...path, key],
                `${key}`,
                reviewWorkspacePolicy((value as any).language ?? (value as any).lang).maxStdinBytes,
                ctx,
            );
        }
    }

    for (const key of ["code", "source", "toolCode"]) {
        if (key in value) {
            validateShortStringField(
                value[key],
                [...path, key],
                `${key}`,
                REVIEW_PROGRESS_LIMITS.maxCodeFieldBytes,
                ctx,
            );
        }
    }

    for (const key of ["workspace", "codeWorkspace", "ideWorkspace", "toolWorkspace"]) {
        if (!(key in value) || value[key] == null) continue;

        const workspaceValue = value[key];
        if (!isPlainObject(workspaceValue)) {
            ctx.addIssue({
                code: "custom",
                path: [...path, key],
                message: `${key} must be an object.`,
            });
            continue;
        }

        if (seenWorkspaces.has(workspaceValue)) continue;
        seenWorkspaces.add(workspaceValue);

        const policy = reviewWorkspacePolicy(
            (workspaceValue as any).language ??
                (value as any).language ??
                (value as any).lang,
        );
        const issues = validateWorkspaceState(workspaceValue, policy);
        for (const issue of issues) {
            ctx.addIssue({
                code: "custom",
                path: [...path, key],
                message: issue,
            });
        }
    }
}

function validatePracticeItemPatch(
    value: unknown,
    path: (string | number)[],
    ctx: z.RefinementCtx,
    seenWorkspaces: WeakSet<object>,
) {
    if (value == null) return;
    if (!isPlainObject(value)) {
        ctx.addIssue({
            code: "custom",
            path,
            message: "practiceItemPatch must be an object.",
        });
        return;
    }

    const keys = asKeys(value);
    if (keys.length > REVIEW_PROGRESS_LIMITS.maxExercisesPerTopic) {
        ctx.addIssue({
            code: "custom",
            path,
            message: `practiceItemPatch exceeds the ${REVIEW_PROGRESS_LIMITS.maxExercisesPerTopic} entry limit.`,
        });
        return;
    }

    for (const key of keys) {
        validateWorkspaceCarrier(value[key], [...path, key], ctx, seenWorkspaces);
    }
}

function validateQuizState(
    value: unknown,
    path: (string | number)[],
    ctx: z.RefinementCtx,
    seenWorkspaces: WeakSet<object>,
) {
    if (value == null) return;
    if (!isPlainObject(value)) {
        ctx.addIssue({
            code: "custom",
            path,
            message: "quizState must be an object.",
        });
        return;
    }

    const keys = asKeys(value);
    if (keys.length > REVIEW_PROGRESS_LIMITS.maxCardsPerTopic) {
        ctx.addIssue({
            code: "custom",
            path,
            message: `quizState exceeds the ${REVIEW_PROGRESS_LIMITS.maxCardsPerTopic} entry limit.`,
        });
        return;
    }

    for (const key of keys) {
        const entry = value[key];
        if (!isPlainObject(entry)) {
            ctx.addIssue({
                code: "custom",
                path: [...path, key],
                message: "quizState entries must be objects.",
            });
            continue;
        }

        validatePracticeItemPatch(entry.practiceItemPatch, [...path, key, "practiceItemPatch"], ctx, seenWorkspaces);
    }
}

function validateRuntimeStateV2(
    value: unknown,
    path: (string | number)[],
    ctx: z.RefinementCtx,
    seenWorkspaces: WeakSet<object>,
) {
    if (value == null) return;
    if (!isPlainObject(value)) {
        ctx.addIssue({
            code: "custom",
            path,
            message: "runtimeStateV2 must be an object.",
        });
        return;
    }

    const cards = value.cards;
    if (cards != null) {
        if (!isPlainObject(cards)) {
            ctx.addIssue({
                code: "custom",
                path: [...path, "cards"],
                message: "runtimeStateV2.cards must be an object.",
            });
        } else {
            const keys = asKeys(cards);
            if (keys.length > REVIEW_PROGRESS_LIMITS.maxCardsPerTopic) {
                ctx.addIssue({
                    code: "custom",
                    path: [...path, "cards"],
                    message: `runtimeStateV2.cards exceeds the ${REVIEW_PROGRESS_LIMITS.maxCardsPerTopic} entry limit.`,
                });
            }
            for (const key of keys) {
                validateWorkspaceCarrier(cards[key], [...path, "cards", key], ctx, seenWorkspaces);
            }
        }
    }

    const exercises = value.exercises;
    if (exercises != null) {
        if (!isPlainObject(exercises)) {
            ctx.addIssue({
                code: "custom",
                path: [...path, "exercises"],
                message: "runtimeStateV2.exercises must be an object.",
            });
        } else {
            const keys = asKeys(exercises);
            if (keys.length > REVIEW_PROGRESS_LIMITS.maxExercisesPerTopic) {
                ctx.addIssue({
                    code: "custom",
                    path: [...path, "exercises"],
                    message: `runtimeStateV2.exercises exceeds the ${REVIEW_PROGRESS_LIMITS.maxExercisesPerTopic} entry limit.`,
                });
            }
            for (const key of keys) {
                validateWorkspaceCarrier(exercises[key], [...path, "exercises", key], ctx, seenWorkspaces);
            }
        }
    }
}

function validateLooseWorkspaceMap(
    value: unknown,
    path: (string | number)[],
    label: string,
    maxEntries: number,
    ctx: z.RefinementCtx,
    seenWorkspaces: WeakSet<object>,
) {
    if (value == null) return;
    if (!isPlainObject(value)) {
        ctx.addIssue({
            code: "custom",
            path,
            message: `${label} must be an object.`,
        });
        return;
    }

    const keys = asKeys(value);
    if (keys.length > maxEntries) {
        ctx.addIssue({
            code: "custom",
            path,
            message: `${label} exceeds the ${maxEntries} entry limit.`,
        });
        return;
    }

    for (const key of keys) {
        if (isPlainObject(value[key])) {
            validateWorkspaceCarrier(value[key], [...path, key], ctx, seenWorkspaces);
        }
    }
}

export function validateReviewProgressState(
    state: unknown,
    ctx: z.RefinementCtx,
) {
    if (!isPlainObject(state)) {
        ctx.addIssue({
            code: "custom",
            path: ["state"],
            message: "state must be a plain object.",
        });
        return;
    }

    const totalBytes = measureReviewProgressPayloadBytes(state);
    if (totalBytes > REVIEW_PROGRESS_LIMITS.maxJsonStateBytes) {
        ctx.addIssue({
            code: "custom",
            path: ["state"],
            message: `state exceeds the ${REVIEW_PROGRESS_LIMITS.maxJsonStateBytes} byte limit.`,
        });
    }

    const topics = state.topics;
    if (topics != null) {
        if (!isPlainObject(topics)) {
            ctx.addIssue({
                code: "custom",
                path: ["state", "topics"],
                message: "topics must be an object.",
            });
        } else {
            const topicKeys = asKeys(topics);
            if (topicKeys.length > REVIEW_PROGRESS_LIMITS.maxTopics) {
                ctx.addIssue({
                    code: "custom",
                    path: ["state", "topics"],
                    message: `topics exceeds the ${REVIEW_PROGRESS_LIMITS.maxTopics} entry limit.`,
                });
            }

            const seenWorkspaces = new WeakSet<object>();
            for (const topicKey of topicKeys) {
                const topic = topics[topicKey];
                if (!isPlainObject(topic)) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["state", "topics", topicKey],
                        message: "topic progress entries must be objects.",
                    });
                    continue;
                }

                validateBooleanRecord(
                    topic.cardsDone,
                    ["state", "topics", topicKey, "cardsDone"],
                    "cardsDone",
                    REVIEW_PROGRESS_LIMITS.maxCardsPerTopic,
                    ctx,
                );
                validateBooleanRecord(
                    topic.quizzesDone,
                    ["state", "topics", topicKey, "quizzesDone"],
                    "quizzesDone",
                    REVIEW_PROGRESS_LIMITS.maxCardsPerTopic,
                    ctx,
                );
                validateQuizState(
                    topic.quizState,
                    ["state", "topics", topicKey, "quizState"],
                    ctx,
                    seenWorkspaces,
                );
                validateLooseWorkspaceMap(
                    topic.toolState,
                    ["state", "topics", topicKey, "toolState"],
                    "toolState",
                    REVIEW_PROGRESS_LIMITS.maxCardsPerTopic,
                    ctx,
                    seenWorkspaces,
                );
                validateLooseWorkspaceMap(
                    topic.sketchState,
                    ["state", "topics", topicKey, "sketchState"],
                    "sketchState",
                    REVIEW_PROGRESS_LIMITS.maxCardsPerTopic,
                    ctx,
                    seenWorkspaces,
                );
                validateRuntimeStateV2(
                    topic.runtimeStateV2,
                    ["state", "topics", topicKey, "runtimeStateV2"],
                    ctx,
                    seenWorkspaces,
                );
            }
        }
    }

    validateShortStringField(
        state.activeTopicId,
        ["state", "activeTopicId"],
        "activeTopicId",
        REVIEW_PROGRESS_LIMITS.maxStringFieldBytes,
        ctx,
    );
    validateShortStringField(
        state.assignmentSessionId,
        ["state", "assignmentSessionId"],
        "assignmentSessionId",
        REVIEW_PROGRESS_LIMITS.maxStringFieldBytes,
        ctx,
    );

    if (state.quizVersion != null && (!Number.isInteger(state.quizVersion) || Number(state.quizVersion) < 0)) {
        ctx.addIssue({
            code: "custom",
            path: ["state", "quizVersion"],
            message: "quizVersion must be a non-negative integer.",
        });
    }

    if (state.moduleCompleted != null && typeof state.moduleCompleted !== "boolean") {
        ctx.addIssue({
            code: "custom",
            path: ["state", "moduleCompleted"],
            message: "moduleCompleted must be a boolean.",
        });
    }

    if (state.moduleCompletedAt != null && typeof state.moduleCompletedAt !== "string") {
        ctx.addIssue({
            code: "custom",
            path: ["state", "moduleCompletedAt"],
            message: "moduleCompletedAt must be a string.",
        });
    }

    if (state.__saveRevision != null && (!Number.isFinite(state.__saveRevision) || Number(state.__saveRevision) < 0)) {
        ctx.addIssue({
            code: "custom",
            path: ["state", "__saveRevision"],
            message: "__saveRevision must be a non-negative number.",
        });
    }
}

export const ReviewProgressWriteSchema = z
    .object({
        subjectSlug: z.string().trim().min(1),
        moduleSlug: z.string().trim().optional(),
        moduleId: z.string().trim().optional(),
        moduleRef: z.string().trim().optional(),
        locale: z.string().trim().min(1).max(16).default("en"),
        state: z.custom<ReviewProgressState>(
            (value) => !!value && typeof value === "object" && !Array.isArray(value),
            "Missing/invalid state.",
        ),
    })
    .superRefine((value, ctx) => {
        if (!pickModuleSlug(value.moduleSlug, value.moduleId, value.moduleRef)) {
            ctx.addIssue({
                code: "custom",
                path: ["moduleSlug"],
                message: "Missing moduleSlug/moduleId/moduleRef.",
            });
        }

        const payloadBytes = measureReviewProgressPayloadBytes(value);
        if (payloadBytes > REVIEW_PROGRESS_LIMITS.maxPayloadBytes) {
            ctx.addIssue({
                code: "custom",
                path: [],
                message: `Payload exceeds the ${REVIEW_PROGRESS_LIMITS.maxPayloadBytes} byte limit.`,
            });
        }

        validateReviewProgressState(value.state, ctx);
    })
    .transform((value) => ({
        ...value,
        moduleRef: pickModuleSlug(value.moduleSlug, value.moduleId, value.moduleRef),
    }));
