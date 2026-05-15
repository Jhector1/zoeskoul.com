import type { WorkspaceStateV2 } from "@/components/ide/types";
import { defaultMainFile } from "@/components/ide/languageDefaults";
import type { WorkspaceLanguage } from "@/lib/practice/types";

export function hasNonBlankText(value: unknown) {
    return typeof value === "string" && value.trim().length > 0;
}

export function normalizeWorkspaceLanguage(
    value: unknown,
    fallback: WorkspaceLanguage = "python",
): WorkspaceLanguage {
    const raw = String(value ?? "").toLowerCase();

    switch (raw) {
        case "sql":
        case "java":
        case "javascript":
        case "c":
        case "cpp":
        case "bash":
        case "web":
        case "python":
            return raw as WorkspaceLanguage;
        default:
            return fallback;
    }
}

export function getWorkspaceLanguage(
    workspace: WorkspaceStateV2 | null | undefined,
): WorkspaceLanguage | null {
    if (!workspace || workspace.version !== 2) return null;

    const raw = String(workspace.language ?? "").trim();
    if (!raw) return null;

    return normalizeWorkspaceLanguage(raw);
}

function stateHasSqlSignals(state: any) {
    if (!state || typeof state !== "object") return false;

    return (
        Boolean(state.fixedSqlDialect) ||
        Boolean(state.sqlDialect) ||
        Boolean(state.sqlDatasetId) ||
        Boolean(state.datasetId) ||
        Boolean(state.runtime?.datasetId) ||
        typeof state.sqlSchemaSql === "string" ||
        typeof state.sqlSeedSql === "string"
    );
}

export function getStateLanguage(
    state: any,
    workspace?: WorkspaceStateV2 | null,
): WorkspaceLanguage | null {
    const workspaceLanguage = getWorkspaceLanguage(workspace ?? null);
    if (workspaceLanguage) return workspaceLanguage;

    for (const value of [
        state?.codeLang,
        state?.lang,
        state?.language,
    ]) {
        if (typeof value === "string" && value.trim()) {
            return normalizeWorkspaceLanguage(value);
        }
    }

    if (stateHasSqlSignals(state)) return "sql";

    return null;
}

export function stateLanguageMatches(
    state: any,
    expectedLanguage: unknown,
    workspace?: WorkspaceStateV2 | null,
): boolean {
    const expected = normalizeWorkspaceLanguage(expectedLanguage);
    const actual = getStateLanguage(state, workspace);

    return actual === expected;
}

export function getWorkspaceEntryCode(
    workspace: WorkspaceStateV2 | null | undefined,
) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return null;
    }

    const entryId = workspace.entryFileId || workspace.activeFileId;
    const file =
        workspace.nodes.find((node) => node.kind === "file" && node.id === entryId) ??
        workspace.nodes.find((node) => node.kind === "file");

    return file && file.kind === "file" ? String(file.content ?? "") : null;
}

export function workspaceHasNonBlankEntry(
    workspace: WorkspaceStateV2 | null | undefined,
) {
    return hasNonBlankText(getWorkspaceEntryCode(workspace));
}

export function isLearnerOwnedWorkspaceState(
    state: any,
    workspace: WorkspaceStateV2 | null | undefined,
) {
    if (!state) return false;

    if (state.userEdited === true) return true;
    if (state.workspaceOrigin === "user") return true;

    if (state.workspaceOrigin === "saved") {
        return workspaceHasNonBlankEntry(workspace);
    }

    return false;
}

export function workspaceFromCode(args: {
    language: unknown;
    code: string;
    stdin?: string | null;
}): WorkspaceStateV2 {
    const language = normalizeWorkspaceLanguage(args.language);
    const now = Date.now();
    const fileName = defaultMainFile(language);
    const fileId = `file:${fileName}`;

    return {
        version: 2,
        language,
        nodes: [
            {
                id: fileId,
                kind: "file",
                name: fileName,
                parentId: null,
                content: args.code,
                createdAt: now,
                updatedAt: now,
            },
        ],
        openTabs: [fileId],
        activeFileId: fileId,
        entryFileId: fileId,
        stdin: String(args.stdin ?? ""),
        expanded: [],
        leftPct: 40,
    };
}

export function workspaceWithEntryCode(
    workspace: WorkspaceStateV2 | null | undefined,
    code: string,
): WorkspaceStateV2 | null {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return workspace ?? null;
    }

    const entryId = workspace.entryFileId || workspace.activeFileId;
    const fallbackFile = workspace.nodes.find((node) => node.kind === "file");

    const targetId = workspace.nodes.some(
        (node) => node.kind === "file" && node.id === entryId,
    )
        ? entryId
        : fallbackFile?.id;

    if (!targetId) return workspace;

    let changed = false;
    const now = Date.now();

    const nodes = workspace.nodes.map((node) => {
        if (node.kind !== "file" || node.id !== targetId) return node;

        if (String(node.content ?? "") === code) return node;

        changed = true;

        return {
            ...node,
            content: code,
            updatedAt: now,
        };
    });

    return changed ? { ...workspace, nodes } : workspace;
}

/**
 * One shared source-of-truth rule for Python, SQL, Java, C, etc.
 *
 * - Workspace entry text is canonical.
 * - code/source are mirrors.
 * - If code exists but workspace is missing, synthesize the language-default workspace.
 * - If workspace is blank and not learner-owned, hydrate it from code.
 * - If learner intentionally owns a blank workspace, preserve blank.
 */
export function normalizeCodeWorkspacePair(args: {
    workspace: WorkspaceStateV2 | null | undefined;
    code: unknown;
    state?: any;
    language?: unknown;
    stdin?: string | null;
}) {
    const code = typeof args.code === "string" ? args.code : "";
    const workspace = args.workspace ?? null;
    const workspaceCode = getWorkspaceEntryCode(workspace);

    if (hasNonBlankText(workspaceCode)) {
        return {
            workspace,
            code: workspaceCode!,
        };
    }

    if (isLearnerOwnedWorkspaceState(args.state, workspace)) {
        return {
            workspace,
            code: workspaceCode ?? "",
        };
    }

    if (workspace && hasNonBlankText(code)) {
        return {
            workspace: workspaceWithEntryCode(workspace, code),
            code,
        };
    }

    if (!workspace && hasNonBlankText(code)) {
        return {
            workspace: workspaceFromCode({
                language: args.language,
                code,
                stdin: args.stdin,
            }),
            code,
        };
    }

    return {
        workspace,
        code,
    };
}
