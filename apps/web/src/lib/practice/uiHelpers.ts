import type {
    WorkspaceLanguage,
    Exercise,
    SubmitAnswer,
    TopicSlug,
    Vec3,
} from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";
import { serializeWorkspaceForCodeRun } from "@/lib/code/workspaceSubmission";
import type { FileEntry } from "@/lib/code/types";
import { isTextWorkspaceFileEntry } from "@zoeskoul/code-contracts";
import { exportWorkspaceEntries } from "@/components/ide/fsTree";
import { applyTerminalWorkspaceHintsToEntries } from "@/lib/practice/terminalWorkspaceHints";
import { normalizeVisibleTerminalTranscriptText } from "@/lib/practice/visibleTerminalTranscript";

function getWorkspaceEntryContent(args: {
    entry: string;
    files: FileEntry[];
}) {
    const match = args.files.find((file) => file.path === args.entry);
    return match && isTextWorkspaceFileEntry(match)
        ? String(match.content ?? "")
        : "";
}

function getTerminalEvidence(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }

    const record = value as Record<string, unknown>;
    const commands = Array.isArray(record.commands)
        ? record.commands
              .map((entry) => String(entry ?? "").trim())
              .filter(Boolean)
        : [];
    const outputText =
        typeof record.outputText === "string"
            ? record.outputText
            : typeof record.output === "string"
                ? record.output
                : "";
    const cwd =
        typeof record.cwd === "string" && record.cwd.trim().length > 0
            ? record.cwd.trim()
            : undefined;

    if (!commands.length && !outputText.trim() && !cwd) {
        return undefined;
    }

    return {
        commands,
        outputText,
        ...(cwd ? { cwd } : {}),
    };
}

type PracticeTerminalEvidenceForSubmit = ReturnType<typeof getTerminalEvidence>;

function getVisibleTerminalEvidenceForSubmit(): PracticeTerminalEvidenceForSubmit {
    if (typeof document === "undefined") return undefined;

    const outputText = normalizeVisibleTerminalTranscriptText(
        Array.from(
            document.querySelectorAll<HTMLElement>(
                '[data-testid="interactive-terminal-transcript"], [data-testid="interactive-terminal"]',
            ),
        ).map((node) =>
            typeof node.innerText === "string" && node.innerText.trim()
                ? node.innerText
                : node.textContent,
        ),
    );

    return getTerminalEvidence({ outputText });
}

function mergeTerminalEvidenceForSubmit(
    ...values: Array<unknown | PracticeTerminalEvidenceForSubmit>
): PracticeTerminalEvidenceForSubmit {
    const commands: string[] = [];
    const seenCommands = new Set<string>();
    const outputParts: string[] = [];
    let cwd: string | undefined;

    for (const value of values) {
        const evidence = getTerminalEvidence(value);
        if (!evidence) continue;

        for (const command of evidence.commands ?? []) {
            const normalized = String(command ?? "").trim();
            if (!normalized || seenCommands.has(normalized)) continue;
            seenCommands.add(normalized);
            commands.push(normalized);
        }

        if (String(evidence.outputText ?? "").trim()) {
            outputParts.push(String(evidence.outputText));
        }

        if (!cwd && evidence.cwd) {
            cwd = evidence.cwd;
        }
    }

    const outputText = normalizeVisibleTerminalTranscriptText(outputParts);

    if (!commands.length && !outputText.trim() && !cwd) {
        return undefined;
    }

    return {
        commands,
        outputText,
        ...(cwd ? { cwd } : {}),
    };
}

export function resizeGrid(prev: string[][], rows: number, cols: number) {
    const r = Math.max(1, Math.floor(rows));
    const c = Math.max(1, Math.floor(cols));
    return Array.from({ length: r }, (_, i) =>
        Array.from({ length: c }, (_, j) => String(prev?.[i]?.[j] ?? "")),
    );
}

export function cloneVec(v: any): Vec3 {
    return { x: Number(v?.x ?? 0), y: Number(v?.y ?? 0), z: Number(v?.z ?? 0) };
}

function getRequiredMatrixShape(ex: any): { rows: number; cols: number } | null {
    const r = Number(ex?.rows);
    const c = Number(ex?.cols);
    if (Number.isFinite(r) && Number.isFinite(c) && r >= 1 && c >= 1) {
        return { rows: Math.floor(r), cols: Math.floor(c) };
    }
    return null;
}

export type InitItemOptions = {
    resolveText?: (value: string) => string;
};

function resolveMaybeTagged(
    value: unknown,
    resolveText?: (value: string) => string,
): string {
    const s = String(value ?? "");
    return resolveText ? resolveText(s) : s;
}

export function getExerciseAuthoredHelpContent(
    ex: Exercise | null | undefined,
    stepKey: string,
): string | null {
    const helpSteps = Array.isArray((ex as any)?.help?.steps)
        ? ((ex as any).help.steps as Array<{ key?: string; content?: string }>)
        : [];

    const found = helpSteps.find((step) => String(step?.key ?? "") === stepKey);
    if (found?.content) return String(found.content);

    if (stepKey === "hint_1" && typeof (ex as any)?.hint === "string") {
        return String((ex as any).hint);
    }

    return null;
}

export function buildSubmitAnswerFromItem(item: QItem): SubmitAnswer | undefined {
    const ex = item.exercise;

    if (ex.kind === "text_input") {
        const v = String((item as any).text ?? "").trim();
        if (!v) return undefined;
        return { kind: "text_input", value: v };
    }

    if (ex.kind === "listen_build" || ex.kind === "word_bank_arrange") {
        const v = String((item as any).text ?? "").trim();
        if (!v) return undefined;
        return { kind: ex.kind, value: v } as any;
    }

    if (ex.kind === "fill_blank_choice") {
        const v = String((item as any).text ?? item.single ?? "").trim();
        if (!v) return undefined;
        return { kind: "fill_blank_choice", value: v };
    }

    if (ex.kind === "drag_reorder") {
        const tokensRaw = Array.isArray((ex as any).tokens) ? (ex as any).tokens : [];
        const tokenIds = tokensRaw.map((t: any) => String(t?.id ?? t));

        const orderRaw = Array.isArray((item as any).reorder)
            ? (item as any).reorder
            : Array.isArray((item as any).reorderIds)
                ? (item as any).reorderIds
                : [];

        const orderIds = orderRaw.map((x: any) => String(x?.id ?? x));

        if (!orderIds.length || orderIds.length !== tokenIds.length) return undefined;

        const tokenSet = new Set(tokenIds);
        if (orderIds.some((id: any) => !tokenSet.has(id))) return undefined;
        if (new Set(orderIds).size !== tokenIds.length) return undefined;

        return { kind: "drag_reorder", order: orderIds };
    }

    if (ex.kind === "voice_input") {
        const transcript = String((item as any).voiceTranscript ?? "").trim();
        if (!transcript) return undefined;

        const audioId = String((item as any).voiceAudioId ?? "").trim();
        return {
            kind: "voice_input",
            transcript,
            ...(audioId ? { audioId } : {}),
        };
    }

    if (ex.kind === "single_choice") {
        if (!item.single) return undefined;
        return { kind: "single_choice", optionId: item.single };
    }

    if (ex.kind === "multi_choice") {
        if (!item.multi?.length) return undefined;
        return { kind: "multi_choice", optionIds: item.multi };
    }

    if (ex.kind === "numeric") {
        if (!item.num?.trim()) return undefined;
        const v = Number(item.num);
        if (!Number.isFinite(v)) return undefined;
        return { kind: "numeric", value: v };
    }

    if (ex.kind === "vector_drag_target") {
        return {
            kind: "vector_drag_target",
            a: { ...item.dragA },
            b: { ...item.dragB },
        };
    }

    if (ex.kind === "vector_drag_dot") {
        return { kind: "vector_drag_dot", a: { ...item.dragA } };
    }

    if (ex.kind === "matrix_input") {
        const rows = Math.max(1, Math.floor(item.matRows || 0));
        const cols = Math.max(1, Math.floor(item.matCols || 0));

        const req = getRequiredMatrixShape(ex as any);
        if (req && (rows !== req.rows || cols !== req.cols)) return undefined;

        if (!item.mat || item.mat.length !== rows) return undefined;
        for (const row of item.mat) {
            if (!Array.isArray(row) || row.length !== cols) return undefined;
        }

        const values: number[][] = [];
        for (let r = 0; r < rows; r++) {
            const row: number[] = [];
            for (let c = 0; c < cols; c++) {
                const raw = String(item.mat[r][c] ?? "").trim();
                if (!raw) return undefined;

                const v = Number(raw);
                if (!Number.isFinite(v)) return undefined;

                row.push((ex as any).integerOnly ? Math.trunc(v) : v);
            }
            values.push(row);
        }
        return { kind: "matrix_input", values };
    }

    if (ex.kind === "code_input") {
        const language = String(
            (item as any).codeLang ?? (ex as any).language ?? "python",
        ) as WorkspaceLanguage;

        const stdin = String(
            (item as any).codeStdin ?? (item as any).stdin ?? "",
        ).trimEnd();
        const workspace =
            (item as any).workspace ??
            (item as any).codeWorkspace ??
            (item as any).ideWorkspace ??
            null;
        const workspaceSubmission = serializeWorkspaceForCodeRun(workspace);
        const workspaceCode =
            workspaceSubmission &&
            workspaceSubmission.files.length > 0 &&
            workspaceSubmission.entry
                ? getWorkspaceEntryContent({
                    entry: workspaceSubmission.entry,
                    files: workspaceSubmission.files,
                  }).trimEnd()
                : "";
        const code = (
            workspaceCode ||
            String((item as any).code ?? (item as any).source ?? "")
        ).trimEnd();
        const terminalEvidence = mergeTerminalEvidenceForSubmit(
            (item as any).terminalEvidence,
            getVisibleTerminalEvidenceForSubmit(),
        );

        if (!code.trim() && !workspaceSubmission && !terminalEvidence) return undefined;

        const workspaceFiles = workspaceSubmission
            ? applyTerminalWorkspaceHintsToEntries({
                  entries: exportWorkspaceEntries(workspace.nodes),
                  terminalEvidence,
              })
            : applyTerminalWorkspaceHintsToEntries({
                  entries: [],
                  terminalEvidence,
              });

        return {
            kind: "code_input",
            language,
            code,
            stdin,
            ...(terminalEvidence ? { terminalEvidence } : {}),
            ...(workspaceSubmission || workspaceFiles.length > 0
                ? {
                    entry: workspaceSubmission?.entry ?? "",
                    files: workspaceFiles,
                  }
                : {}),
        };
    }

    return undefined;
}

export function initItemFromExercise(
    ex: Exercise,
    key: string,
    opts?: InitItemOptions,
): QItem {
    const resolveText = opts?.resolveText;

    let a: Vec3 = { x: 0, y: 0, z: 0 };
    let b: Vec3 = { x: 2, y: 1, z: 0 };

    if (ex.kind === "vector_drag_target") {
        a = cloneVec((ex as any).initialA);
        b = cloneVec((ex as any).initialB ?? { x: 2, y: 1, z: 0 });
    } else if (ex.kind === "vector_drag_dot") {
        a = cloneVec((ex as any).initialA);
        b = cloneVec((ex as any).b ?? { x: 2, y: 1, z: 0 });
    }

    const exAny = ex as any;

    const matRows = ex.kind === "matrix_input" ? 2 : 0;
    const matCols = ex.kind === "matrix_input" ? 2 : 0;

    const seed =
        ex.kind === "matrix_input" && Array.isArray(exAny.initialValues)
            ? exAny.initialValues
            : [];

    const mat =
        ex.kind === "matrix_input"
            ? resizeGrid(seed, matRows, matCols)
            : [];

    const base: QItem = {
        key,
        exercise: ex,

        single: "",
        multi: [],
        num: "",

        dragA: a,
        dragB: b,

        matRows,
        matCols,
        mat,

        result: null,
        submitted: false,
        attempts: 0,

        help: {
            openedStepKeys: [],
            activeStepKey: null,
            entries: {},
            busyStepKey: null,
            error: null,
        },

        ui: {},

        revealed: false,

        codeLang: "python",
        code: "",
        codeStdin: "",
        stdin: "",

        text: "",
        reorderIds: [],
        reorder: undefined,

        voiceTranscript: "",
        voiceAudioId: "",

        codeRunOutput: "",
    };

    if (ex.kind === "text_input") {
        return {
            ...base,
            text: resolveMaybeTagged((ex as any).starterText ?? "", resolveText),
        };
    }

    if (ex.kind === "code_input") {
        const lang = (ex as any).language ?? "python";
        return {
            ...base,
            codeLang: lang,
            code: resolveMaybeTagged((ex as any).starterCode ?? "", resolveText),
            codeStdin: resolveMaybeTagged((ex as any).starterStdin ?? "", resolveText),
            stdin: resolveMaybeTagged((ex as any).starterStdin ?? "", resolveText),
        };
    }

    return base;
}

export function normalizeTopicValue(v: string | null | undefined): TopicSlug | "all" {
    const raw = String(v ?? "").trim();
    if (!raw || raw === "all") return "all";
    return raw as TopicSlug;
}
