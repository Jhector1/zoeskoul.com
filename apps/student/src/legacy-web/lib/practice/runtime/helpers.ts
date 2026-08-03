import type {
    Exercise,
    SubmitAnswer,
    TopicSlug,
} from "@/lib/practice/types";
import type { MissedItem, QItem } from "@/lib/practice/uiTypes";
import type { VectorPadState } from "@/components/vectorpad/types";
import {
    buildSubmitAnswerFromItem,
    initItemFromExercise,
} from "@/lib/practice/uiHelpers";
import { isExcusedPracticeItem } from "@/lib/flow/excuse";
import type { SessionHistoryRow } from "./types";

export function coerceMaxAttempts(v: unknown): number | null {
    if (v == null) return null;
    if (v === Number.POSITIVE_INFINITY || v === Infinity) return null;

    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;

    return Math.max(1, Math.floor(n));
}

function isWorkspaceStateForCode(value: unknown) {
    return (
        !!value &&
        typeof value === "object" &&
        (value as any).version === 2 &&
        Array.isArray((value as any).nodes)
    );
}

function getWorkspaceEntryCodeForCodeLike(workspace: any) {
    if (!isWorkspaceStateForCode(workspace)) return null;

    const entryId = workspace.entryFileId || workspace.activeFileId;
    const file = workspace.nodes.find(
        (node: any) => node?.kind === "file" && node.id === entryId,
    );

    return file?.kind === "file" ? String(file.content ?? "") : null;
}

export function extractCodeLike(p: any) {
    const workspace =
        p?.workspace ?? p?.codeWorkspace ?? p?.ideWorkspace ?? null;
    const workspaceCode = getWorkspaceEntryCodeForCodeLike(workspace);

    const code =
        workspaceCode != null
            ? workspaceCode
            : typeof p?.code === "string"
                ? p.code
                : typeof p?.source === "string"
                    ? p.source
                    : null;

    const stdin =
        typeof p?.codeStdin === "string"
            ? p.codeStdin
            : typeof p?.stdin === "string"
                ? p.stdin
                : null;

    const language =
        typeof p?.codeLang === "string"
            ? p.codeLang
            : typeof p?.language === "string"
                ? p.language
                : null;

    return { code, stdin, language };
}

export function isEmptyPracticeAnswer(
    ex: Exercise,
    item: QItem,
    pad?: VectorPadState | null,
) {
    if (ex.kind === "vector_drag_dot") {
        const a = pad?.a ?? (item as any).dragA;
        return !a || ![a.x, a.y, a.z].some((v) => Number.isFinite(v));
    }

    if (ex.kind === "vector_drag_target") {
        const a = pad?.a ?? (item as any).dragA;
        const b = pad?.b ?? (item as any).dragB;
        const hasA = a && [a.x, a.y, a.z].some((v) => Number.isFinite(v));
        const hasB = b && [b.x, b.y, b.z].some((v) => Number.isFinite(v));
        return !(hasA && hasB);
    }

    if (ex.kind === "drag_reorder") {
        const tokens = Array.isArray((ex as any).tokens) ? (ex as any).tokens : [];
        const order = Array.isArray((item as any).reorder)
            ? (item as any).reorder
            : Array.isArray((item as any).reorderIds)
                ? (item as any).reorderIds
                : [];
        return !(tokens.length > 0 && order.length === tokens.length);
    }

    if (ex.kind === "code_input") {
        const { code } = extractCodeLike(item as any);
        const terminalEvidence = (item as any).terminalEvidence;
        const hasTerminalEvidence =
            !!terminalEvidence &&
            (
                (Array.isArray(terminalEvidence.commands) &&
                    terminalEvidence.commands.some((entry: unknown) => String(entry ?? "").trim().length > 0)) ||
                (typeof terminalEvidence.outputText === "string" &&
                    terminalEvidence.outputText.trim().length > 0) ||
                (typeof terminalEvidence.cwd === "string" &&
                    terminalEvidence.cwd.trim().length > 0)
            );

        return !((code && String(code).trim().length > 0) || hasTerminalEvidence);
    }

    if (ex.kind === "text_input") {
        const v = (item as any).text;
        return !(v && String(v).trim().length > 0);
    }

    if (ex.kind === "voice_input") {
        const t = (item as any).voiceTranscript;
        return !(t && String(t).trim().length > 0);
    }

    const built = buildSubmitAnswerFromItem(item);
    return !built;
}

export function applyAnswerPayloadToItem(item: QItem, payload: any) {
    if (!payload || typeof payload !== "object") return;

    switch (payload.kind) {
        case "single_choice":
            (item as any).single = payload.optionId ?? null;
            break;

        case "multi_choice":
            (item as any).multi = Array.isArray(payload.optionIds)
                ? payload.optionIds
                : [];
            break;

        case "numeric":
            (item as any).num =
                payload.value == null ? "" : String(payload.value);
            break;

        case "matrix_input":
            if (Array.isArray(payload.raw)) (item as any).mat = payload.raw;
            break;

        case "code_input": {
            const code =
                typeof payload.code === "string"
                    ? payload.code
                    : typeof payload.source === "string"
                        ? payload.source
                        : "";

            const stdin =
                typeof payload.stdin === "string"
                    ? payload.stdin
                    : typeof payload.codeStdin === "string"
                        ? payload.codeStdin
                        : "";

            const lang =
                typeof payload.language === "string"
                    ? payload.language
                    : typeof payload.codeLang === "string"
                        ? payload.codeLang
                        : null;

            if (lang) (item as any).codeLang = lang;
            (item as any).code = code;
            (item as any).codeStdin = stdin;
            if (payload.terminalEvidence && typeof payload.terminalEvidence === "object") {
                (item as any).terminalEvidence = payload.terminalEvidence;
            }
            break;
        }

        case "vector_drag_dot":
            (item as any).dragA = payload.a ?? (item as any).dragA;
            break;

        case "vector_drag_target":
            (item as any).dragA = payload.a ?? (item as any).dragA;
            (item as any).dragB = payload.b ?? (item as any).dragB;
            break;
    }
}

export function buildCorrectItemFromExpected(
    q: QItem,
    expectedPayload: any,
): QItem | null {
    const exercise = q.exercise as Exercise | undefined;
    if (!exercise || !expectedPayload) return null;

    const payload =
        typeof expectedPayload === "object" && expectedPayload?.kind
            ? expectedPayload
            : {
                kind: String(exercise.kind),
                ...(typeof expectedPayload === "object" ? expectedPayload : {}),
            };

    const item = initItemFromExercise(exercise, `expected:${q.key}`);
    applyAnswerPayloadToItem(item, payload);

    item.submitted = true;
    item.result = { ok: true, finalized: true } as any;

    return item;
}

export function historyRowToQItem(h: SessionHistoryRow): QItem {
    const ex: Exercise = {
        topic: String(h.topic ?? "all"),
        kind: String(h.kind),
        title: String(h.title ?? ""),
        prompt: String(h.prompt ?? ""),
        ...(h.publicPayload ?? {}),
    } as any;

    const key = `history:${String(h.instanceId)}`;
    const item = initItemFromExercise(ex, key);

    item.attempts = Number(h.attempts ?? 0);

    const finalized = Boolean(h.answeredAt) || Number(h.attempts ?? 0) > 0;
    item.submitted = finalized;

    item.result = {
        ok: h.lastOk === null ? undefined : Boolean(h.lastOk),
        finalized,
        expected: h.expectedAnswerPayload ?? null,
        explanation: h.explanation ?? null,
    } as any;

    if (Array.isArray(h.helpUsedKeys) && h.helpUsedKeys.length) {
        item.help.openedStepKeys = [...h.helpUsedKeys];
        item.help.activeStepKey = h.helpUsedKeys[h.helpUsedKeys.length - 1] ?? null;
    }

    applyAnswerPayloadToItem(item, h.lastAnswerPayload);
    return item;
}

export function exerciseSignature(ex: Exercise | null | undefined): string {
    if (!ex) return "";
    return [
        String(ex.topic ?? ""),
        String(ex.kind ?? ""),
        String(ex.title ?? ""),
        String(ex.prompt ?? ""),
    ].join("||");
}

export function stableAt(q: QItem): number {
    const anyQ = q as any;
    const v = anyQ.at ?? anyQ.createdAt ?? anyQ.loadedAt ?? 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export function isPracticeItemFinalized(
    q: QItem | null,
    maxAttempts: number,
    isLockedRun: boolean,
) {
    if (!q) return false;
    if (q.submitted || q.revealed) return true;

    const r: any = q.result;
    if (!r) return false;
    if (r.revealUsed === true || Boolean(r.revealAnswer)) return true;

    if (r.ok === true) return true;
    if (r.finalized === true) return true;

    const left = r.attempts?.left;
    if (typeof left === "number") return left <= 0;

    if (isLockedRun && typeof q.attempts === "number") {
        return q.attempts >= maxAttempts;
    }

    return false;
}

export function buildLocalMissed(
    stack: QItem[],
    _maxAttempts: number,
    _isLockedRun: boolean,
): MissedItem[] {
    const unresolved = new Map<
        string,
        { idx: number; q: QItem; ans: SubmitAnswer }
    >();

    for (let i = 0; i < stack.length; i++) {
        const q = stack[i];
        if (!q?.submitted) continue;
        if (isExcusedPracticeItem(q)) continue;

        const ex = q.exercise;
        if (!ex) continue;

        const sig = exerciseSignature(ex);
        if (!sig) continue;

        const ok = Boolean(q.result?.ok);
        if (ok) {
            unresolved.delete(sig);
            continue;
        }

        const ans = buildSubmitAnswerFromItem(q);
        if (!ans) continue;

        unresolved.set(sig, { idx: i, q, ans });
    }

    const tmp: Array<{ idx: number; item: MissedItem }> = [];

    for (const { idx, q, ans } of unresolved.values()) {
        const ex = q.exercise!;
        tmp.push({
            idx,
            item: {
                id: `${q.key}-missed`,
                at: stableAt(q),
                topic: String(ex.topic) as TopicSlug,
                kind: ex.kind,
                title: ex.title,
                publicPayload: (ex as any).publicPayload,
                prompt: ex.prompt,
                userAnswer: ans,
                expected: (q.result as any)?.expected,
                explanation: (q.result as any)?.explanation ?? null,
            },
        });
    }

    tmp.sort((a, b) => a.idx - b.idx);
    return tmp.map((x) => x.item);
}

export function computePracticeCounts(
    stack: QItem[],
    maxAttempts: number,
    isLockedRun: boolean,
) {
    let answeredCount = 0;
    let correctCount = 0;
    let excusedAnswered = 0;

    for (const q of stack) {
        if (!isPracticeItemFinalized(q, maxAttempts, isLockedRun)) continue;

        answeredCount += 1;

        if (q.result?.ok) {
            correctCount += 1;
        }

        if (isExcusedPracticeItem(q)) {
            excusedAnswered += 1;
        }
    }

    return { answeredCount, correctCount, excusedAnswered };
}

export function computePracticePct(args: {
    answeredCount: number;
    correctCount: number;
    excusedAnswered?: number;
}) {
    const denom = Math.max(0, args.answeredCount - (args.excusedAnswered ?? 0));
    return denom > 0 ? Math.round((args.correctCount / denom) * 100) : 0;
}
