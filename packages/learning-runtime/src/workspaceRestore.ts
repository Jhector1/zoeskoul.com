import {
  getWorkspaceEntryCode,
  workspaceContentHash,
} from "@zoeskoul/workspace-contracts";
import {
  isReviewUserSavedState,
  reviewSavedStateUpdatedAt,
} from "./progressClientSync";
import {
  normalizeTopicProgressKey,
} from "./progressNormalization";

function cleanReviewExerciseKeyPart(
  value: string | null | undefined,
): string {
  const text =
    typeof value === "string" &&
    value.trim()
      ? value.trim()
      : "unknown";

  return text.replace(/[:\s]+/g, "-");
}

function isUsablePersistedReviewCode(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.trim().startsWith("@:")
  );
}

export function canonicalizeReviewExerciseStateKey(
    exerciseKey: string | null | undefined,
    fallbackTopicId?: string | null,
) {
    const raw = String(exerciseKey ?? "").trim();
    if (!raw) return "";

    const parts = raw.split(":").filter(Boolean);
    if (parts.length < 6) return raw;

    const [subjectSlug, moduleSlug, sectionSlug, topicId, cardId, ...exerciseIdParts] = parts;
    if (!exerciseIdParts.length) return raw;

    return [
        cleanReviewExerciseKeyPart(subjectSlug),
        cleanReviewExerciseKeyPart(moduleSlug),
        cleanReviewExerciseKeyPart(sectionSlug),
        cleanReviewExerciseKeyPart(
            normalizeTopicProgressKey(
                fallbackTopicId ?? topicId,
            ),
        ),
        cleanReviewExerciseKeyPart(cardId),
        cleanReviewExerciseKeyPart(
            exerciseIdParts.join(":"),
        ),
    ].join(":");
}

export function isScopedReviewExerciseStateKey(value: string | null | undefined) {
    const raw = String(value ?? "").trim();
    if (!raw) return false;
    return raw.split(":").filter(Boolean).length >= 6;
}

export function summarizeReviewSavedWorkspaceFiles(workspace: any) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return { fileCount: 0, contentLength: 0 };
    }

    const files = workspace.nodes.filter((node: any) => node?.kind === "file");
    return {
        fileCount: files.length,
        contentLength: files.reduce(
            (sum: number, node: any) => sum + String(node?.content ?? "").length,
            0,
        ),
    };
}

export function isReviewWorkspaceState(value: any) {
    return Boolean(value && value.version === 2 && Array.isArray(value.nodes));
}

export function getReviewSavedWorkspace(value: any) {
    if (isReviewWorkspaceState(value?.workspace)) return value.workspace;
    if (isReviewWorkspaceState(value?.codeWorkspace)) return value.codeWorkspace;
    if (isReviewWorkspaceState(value?.ideWorkspace)) return value.ideWorkspace;
    if (isReviewWorkspaceState(value?.toolWorkspace)) return value.toolWorkspace;
    return null;
}

export function reviewWorkspaceHasNonBlankCode(workspace: any) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return false;
    }

    const code = getWorkspaceEntryCode(workspace);
    return isUsablePersistedReviewCode(code);
}

function hasUsableReviewSavedCode(value: unknown) {
    return isUsablePersistedReviewCode(value);
}

export function hasSavedReviewExerciseContent(value: any) {
    const workspace = getReviewSavedWorkspace(value);

    const hasNonBlankCode =
        reviewWorkspaceHasNonBlankCode(workspace) ||
        hasUsableReviewSavedCode(value?.code) ||
        hasUsableReviewSavedCode(value?.source);

    const hasSketch = Boolean(value?.sketch);

    /**
     * Progress-only state must still hydrate.
     * This preserves checked/correct/submitted/completed progress even when
     * stale editor code is intentionally dropped because the starter changed.
     */
    const hasProgressState =
        value?.checked === true ||
        value?.correct === true ||
        value?.submitted === true ||
        value?.completed === true ||
        typeof value?.attempts === "number" ||
        typeof value?.score === "number" ||
        typeof value?.selectedChoice === "string" ||
        Array.isArray(value?.selectedChoices) ||
        Array.isArray(value?.orderedIds) ||
        typeof value?.blankValue === "string" ||
        typeof value?.answer === "string";

    return Boolean(hasNonBlankCode || hasSketch || hasProgressState);
}

export function hasSavedReviewExerciseEditorContent(value: any) {
    const workspace = getReviewSavedWorkspace(value);

    return Boolean(
        reviewWorkspaceHasNonBlankCode(workspace) ||
        hasUsableReviewSavedCode(value?.code) ||
        hasUsableReviewSavedCode(value?.source),
    );
}

export function savedReviewExerciseLooksLikeLearnerEditorWork(value: any, workspace: any) {
    if (!hasSavedReviewExerciseEditorContent(value)) return false;

    /**
     * User/saved owned work is allowed to survive starter regeneration. A
     * starter hash mismatch means the authored starter changed; it should not
     * erase a learner's saved answer.
     */
    if (isReviewUserSavedState(value)) return true;

    /**
     * Passive starter snapshots are runtime bookkeeping, not learner work.
     */
    if (
        value?.workspaceOrigin === "starter" ||
        value?.workspaceOrigin === "empty" ||
        value?.userEdited === false
    ) {
        return false;
    }

    /**
     * Legacy saves may be missing userEdited/workspaceOrigin. If they carry a
     * starterHash and the saved workspace content differs from that hash, treat
     * it as edited learner work. If it matches, it is just an old starter.
     */
    const savedStarterHash =
        typeof value?.starterHash === "string" ? value.starterHash : "";
    if (workspace && savedStarterHash) {
        return workspaceContentHash(workspace) !== savedStarterHash;
    }

    return Boolean(workspace);
}

export function getSavedReviewExerciseCode(value: any, workspace: any) {
    const workspaceCode = getWorkspaceEntryCode(workspace) ?? "";
    if (isUsablePersistedReviewCode(workspaceCode)) return workspaceCode;
    if (isUsablePersistedReviewCode(value?.code)) return value.code;
    if (isUsablePersistedReviewCode(value?.source)) return value.source;
    return "";
}

export function getSavedReviewExerciseStdin(value: any, workspace: any) {
    if (typeof workspace?.stdin === "string") return workspace.stdin;
    if (typeof value?.codeStdin === "string") return value.codeStdin;
    if (typeof value?.stdin === "string") return value.stdin;
    return "";
}

export function getSavedReviewExerciseLanguage(value: any, workspace: any, fallback = "python") {
    if (typeof workspace?.language === "string") return workspace.language;
    if (typeof value?.codeLang === "string") return value.codeLang;
    if (typeof value?.lang === "string") return value.lang;
    if (typeof value?.language === "string") return value.language;
    return fallback;
}

export function looksLikeBetterReviewExerciseRestoreCandidate(existing: any, incoming: any) {
    if (!incoming) return false;
    if (!existing) return true;

    const existingUser = isReviewUserSavedState(existing);
    const incomingUser = isReviewUserSavedState(incoming);
    if (incomingUser !== existingUser) {
        return incomingUser;
    }

    const existingSummary = summarizeReviewSavedWorkspaceFiles(
        existing.workspace ?? existing.codeWorkspace ?? existing.ideWorkspace ?? null,
    );
    const incomingSummary = summarizeReviewSavedWorkspaceFiles(
        incoming.workspace ?? incoming.codeWorkspace ?? incoming.ideWorkspace ?? null,
    );

    if (incomingSummary.fileCount !== existingSummary.fileCount) {
        return incomingSummary.fileCount > existingSummary.fileCount;
    }

    if (incomingSummary.contentLength !== existingSummary.contentLength) {
        return incomingSummary.contentLength > existingSummary.contentLength;
    }

    return reviewSavedStateUpdatedAt(incoming) >= reviewSavedStateUpdatedAt(existing);
}
