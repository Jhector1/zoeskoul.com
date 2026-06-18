import type {
    WorkspaceLanguage,
    Exercise,
    SubmitAnswer,
    TopicSlug,
    Vec3,
} from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";
import { serializeWorkspaceForCodeRun } from "@/lib/code/workspaceSubmission";
import { exportWorkspaceEntries } from "@/components/ide/fsTree";

function getWorkspaceEntryContent(args: {
    entry: string;
    files: Array<{ path: string; content: string }>;
}) {
    const match = args.files.find((file) => file.path === args.entry);
    return match ? String(match.content ?? "") : "";
}

type WorkspaceSubmitEntryForAnswer =
    | {
          /**
           * Existing workspace export entries may omit kind for normal files.
           * Treat missing kind as "file" to match WorkspaceSyncEntry.
           */
          kind?: "file";
          path: string;
          content: string;
      }
    | {
          kind: "directory";
          path: string;
      };

function normalizeTerminalHintPath(input: unknown) {
    const value = String(input ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/\/+/g, "/")
        .replace(/^\/+/, "");

    if (!value) return "";
    if (value.includes("\0")) return "";

    const parts = value.split("/").filter(Boolean);
    if (!parts.length) return "";

    if (parts.some((part) => part === "." || part === "..")) return "";

    return parts.join("/");
}

function tokenizeTerminalCommandForWorkspaceHints(command: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let quote: "'" | '"' | null = null;
    let escaped = false;

    for (const char of String(command ?? "")) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === "\\") {
            escaped = true;
            continue;
        }

        if (quote) {
            if (char === quote) quote = null;
            else current += char;
            continue;
        }

        if (char === "'" || char === '"') {
            quote = char;
            continue;
        }

        if (/\s/.test(char)) {
            if (current) {
                tokens.push(current);
                current = "";
            }
            continue;
        }

        if (char === ";" || char === "|" || char === "&") {
            break;
        }

        current += char;
    }

    if (current) tokens.push(current);

    return tokens;
}

function collectTerminalCommandsForWorkspaceHints(evidence: {
    commands?: string[];
    outputText?: string;
}): string[] {
    const commands = Array.isArray(evidence.commands)
        ? evidence.commands.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : [];

    const seen = new Set(commands);
    const outputText = String(evidence.outputText ?? "");

    for (const line of outputText.split(/\r?\n/g)) {
        const match = line.match(/(?:^|\])[^\r\n$#]*[$#]\s*(.+)$/);
        const command = String(match?.[1] ?? "").trim();

        if (command && !seen.has(command)) {
            seen.add(command);
            commands.push(command);
        }
    }

    return commands;
}

function addDirectoryHint(
    entries: WorkspaceSubmitEntryForAnswer[],
    seen: Set<string>,
    path: string,
) {
    const normalized = normalizeTerminalHintPath(path);
    if (!normalized) return;

    const parts = normalized.split("/");
    let current = "";

    for (const part of parts) {
        current = current ? `${current}/${part}` : part;

        if (seen.has(`directory:${current}`) || seen.has(`file:${current}`)) {
            continue;
        }

        entries.push({
            kind: "directory",
            path: current,
        });
        seen.add(`directory:${current}`);
    }
}

function addFileHint(
    entries: WorkspaceSubmitEntryForAnswer[],
    seen: Set<string>,
    path: string,
) {
    const normalized = normalizeTerminalHintPath(path);
    if (!normalized) return;

    const parent = normalized.split("/").slice(0, -1).join("/");
    if (parent) addDirectoryHint(entries, seen, parent);

    if (seen.has(`file:${normalized}`)) return;

    entries.push({
        kind: "file",
        path: normalized,
        content: "",
    });
    seen.add(`file:${normalized}`);
}

function mergeTerminalWorkspaceHintsIntoAnswerFiles(args: {
    files: WorkspaceSubmitEntryForAnswer[];
    terminalEvidence?: {
        commands?: string[];
        outputText?: string;
    };
}) {
    const files = [...args.files];
    const seen = new Set<string>();

    for (const entry of files) {
        const kind = entry.kind === "directory" ? "directory" : "file";
        const path = normalizeTerminalHintPath(entry.path);
        if (path) seen.add(`${kind}:${path}`);
    }

    for (const command of collectTerminalCommandsForWorkspaceHints(
        args.terminalEvidence ?? {},
    )) {
        const tokens = tokenizeTerminalCommandForWorkspaceHints(command);
        const executable = tokens[0] ?? "";

        if (executable === "mkdir") {
            for (const token of tokens.slice(1)) {
                if (!token || token.startsWith("-")) continue;
                addDirectoryHint(files, seen, token);
            }
            continue;
        }

        if (executable === "touch") {
            for (const token of tokens.slice(1)) {
                if (!token || token.startsWith("-")) continue;
                addFileHint(files, seen, token);
            }
            continue;
        }

        const redirectIndex = tokens.indexOf(">");
        if (redirectIndex >= 0 && tokens[redirectIndex + 1]) {
            addFileHint(files, seen, tokens[redirectIndex + 1]);
        }
    }

    return files;
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
    const outputText = typeof record.outputText === "string" ? record.outputText : "";
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
        const terminalEvidence = getTerminalEvidence((item as any).terminalEvidence);

        if (!code.trim() && !workspaceSubmission && !terminalEvidence) return undefined;

        const workspaceFiles = workspaceSubmission
            ? mergeTerminalWorkspaceHintsIntoAnswerFiles({
                  files: exportWorkspaceEntries(workspace.nodes),
                  terminalEvidence,
              })
            : mergeTerminalWorkspaceHintsIntoAnswerFiles({
                  files: [],
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
