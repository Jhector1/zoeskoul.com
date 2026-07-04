export type TerminalWorkspaceEvidenceLike = {
    commands?: unknown;
    outputText?: unknown;
};

export type TerminalWorkspaceEntry =
    | {
          kind?: "file";
          path: string;
          content: string;
      }
    | {
          kind: "directory";
          path: string;
      };

type WorkspaceHintState = {
    hasFile(path: string): boolean;
    hasFolder(path: string): boolean;
    addFile(path: string): void;
    addFolder(path: string): void;
    removePath(path: string): void;
    filesUnder(path: string): string[];
    foldersUnder(path: string): string[];
};

export function normalizeTerminalWorkspacePath(input: unknown) {
    const value = String(input ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/\/+/g, "/")
        .replace(/^\/+/, "");

    if (!value || value.includes("\0")) return "";

    const parts = value.split("/").filter(Boolean);
    if (!parts.length) return "";
    if (parts.some((part) => part === "." || part === "..")) return "";

    return parts.join("/");
}

export function tokenizeTerminalWorkspaceCommand(command: string): string[] {
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

export function collectTerminalWorkspaceCommands(
    evidence?: TerminalWorkspaceEvidenceLike,
): string[] {
    const commands = Array.isArray(evidence?.commands)
        ? evidence.commands
              .map((entry) => String(entry ?? "").trim())
              .filter(Boolean)
        : [];

    const seen = new Set(commands);
    const outputText = String(evidence?.outputText ?? "");

    for (const line of outputText.split(/\r?\n/g)) {
        const match = line.match(/(?:^|\])[^$\n#]*[$#]\s*(.+)$/);
        const promptedCommand = String(match?.[1] ?? "").trim();
        const bareLine = String(line ?? "").trim();
        const command = promptedCommand || bareLine;

        if (command && !seen.has(command)) {
            const tokens = tokenizeTerminalWorkspaceCommand(command);
            const executable = tokens[0] ?? "";
            const looksLikeWorkspaceMutation =
                executable === "mkdir" ||
                executable === "touch" ||
                executable === "rm" ||
                executable === "mv" ||
                executable === "cp" ||
                tokens.includes(">");

            if (!promptedCommand && !looksLikeWorkspaceMutation) {
                continue;
            }

            seen.add(command);
            commands.push(command);
        }
    }

    return commands;
}

function nonOptionTokens(tokens: string[]) {
    return tokens.filter((token) => token && !token.startsWith("-"));
}

function basename(path: string) {
    const normalized = normalizeTerminalWorkspacePath(path);
    if (!normalized) return "";
    return normalized.split("/").filter(Boolean).at(-1) ?? "";
}

function destinationForShellMoveOrCopy(args: {
    state: WorkspaceHintState;
    sourcePath: string;
    destinationPath: string;
}) {
    const sourcePath = normalizeTerminalWorkspacePath(args.sourcePath);
    let destinationPath = normalizeTerminalWorkspacePath(args.destinationPath);

    if (!sourcePath || !destinationPath) return "";

    if (args.state.hasFolder(destinationPath)) {
        const sourceBasename = basename(sourcePath);
        if (sourceBasename) {
            destinationPath = `${destinationPath}/${sourceBasename}`;
        }
    }

    return destinationPath;
}

function applyMoveOrCopyHint(args: {
    command: "mv" | "cp";
    state: WorkspaceHintState;
    sourcePath: string;
    destinationPath: string;
}) {
    const sourcePath = normalizeTerminalWorkspacePath(args.sourcePath);
    const rawDestinationPath = normalizeTerminalWorkspacePath(args.destinationPath);

    if (!sourcePath) return;

    const sourceFiles = args.state.filesUnder(sourcePath);
    const sourceFolders = args.state.foldersUnder(sourcePath);
    const sourceHasConcreteEntry =
        args.state.hasFile(sourcePath) ||
        args.state.hasFolder(sourcePath) ||
        sourceFiles.length > 0 ||
        sourceFolders.length > 0;
    const destinationLooksLikeFile =
        !!rawDestinationPath && /\/?[^/]+\.[^/]+$/.test(rawDestinationPath);

    /**
     * Terminal workspace hints are a fallback for slightly stale UI state.
     * They should not invent files from failed mv/cp commands.
     *
     * If the source path does not exist in the known workspace snapshot, treat
     * the command as non-authoritative unless the destination is clearly a file
     * path. That still lets us recover from stale UI snapshots in file-to-file
     * move/copy flows, while avoiding fake "folder as file" paths like
     * student-notes-organizer/classes after a typoed mv source.
     */
    if (!sourceHasConcreteEntry && !destinationLooksLikeFile) {
        return;
    }

    const destinationPath = destinationForShellMoveOrCopy({
        state: args.state,
        sourcePath: args.sourcePath,
        destinationPath: args.destinationPath,
    });

    if (!destinationPath) return;

    const sourceLooksLikeFile =
        args.state.hasFile(sourcePath) ||
        (!sourceHasConcreteEntry && destinationLooksLikeFile);

    if (args.command === "mv" && sourceHasConcreteEntry) {
        args.state.removePath(sourcePath);
    }

    if (sourceLooksLikeFile) {
        args.state.addFile(destinationPath);
        return;
    }

    args.state.addFolder(destinationPath);

    const sourcePrefix = `${sourcePath}/`;

    for (const folderPath of sourceFolders) {
        if (folderPath === sourcePath) continue;
        const suffix = folderPath.slice(sourcePrefix.length);
        args.state.addFolder(`${destinationPath}/${suffix}`);
    }

    for (const filePath of sourceFiles) {
        const suffix =
            filePath === sourcePath ? basename(filePath) : filePath.slice(sourcePrefix.length);

        args.state.addFile(suffix ? `${destinationPath}/${suffix}` : destinationPath);
    }
}

function applyWorkspaceCommandHint(args: {
    state: WorkspaceHintState;
    command: string;
}) {
    const tokens = tokenizeTerminalWorkspaceCommand(args.command);
    const executable = tokens[0] ?? "";
    const operands = nonOptionTokens(tokens.slice(1));

    if (executable === "mkdir") {
        for (const token of operands) args.state.addFolder(token);
        return;
    }

    if (executable === "touch") {
        for (const token of operands) args.state.addFile(token);
        return;
    }

    if (executable === "rm") {
        for (const token of operands) args.state.removePath(token);
        return;
    }

    if ((executable === "mv" || executable === "cp") && operands.length >= 2) {
        const destinationPath = operands.at(-1) ?? "";
        const sourcePaths = operands.slice(0, -1);

        for (const sourcePath of sourcePaths) {
            applyMoveOrCopyHint({
                command: executable,
                state: args.state,
                sourcePath,
                destinationPath,
            });
        }

        return;
    }

    const redirectIndex = tokens.indexOf(">");
    if (redirectIndex >= 0 && tokens[redirectIndex + 1]) {
        args.state.addFile(tokens[redirectIndex + 1]);
    }
}

function addFolderToSet(folderPath: string, folderPaths: Set<string>) {
    const normalized = normalizeTerminalWorkspacePath(folderPath);
    if (!normalized) return;

    const parts = normalized.split("/");
    let current = "";

    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        folderPaths.add(current);
    }
}

function addFileToSets(
    filePath: string,
    filePaths: Set<string>,
    folderPaths: Set<string>,
) {
    const normalized = normalizeTerminalWorkspacePath(filePath);
    if (!normalized) return;

    filePaths.add(normalized);

    const parts = normalized.split("/");
    let current = "";

    for (const part of parts.slice(0, -1)) {
        current = current ? `${current}/${part}` : part;
        folderPaths.add(current);
    }
}

function removePathFromSets(
    path: string,
    filePaths: Set<string>,
    folderPaths: Set<string>,
) {
    const normalized = normalizeTerminalWorkspacePath(path);
    if (!normalized) return;

    filePaths.delete(normalized);
    folderPaths.delete(normalized);

    const prefix = `${normalized}/`;

    for (const filePath of [...filePaths]) {
        if (filePath.startsWith(prefix)) filePaths.delete(filePath);
    }

    for (const folderPath of [...folderPaths]) {
        if (folderPath.startsWith(prefix)) folderPaths.delete(folderPath);
    }
}

export function applyTerminalWorkspaceHintsToPathSets(args: {
    terminalEvidence?: TerminalWorkspaceEvidenceLike;
    submittedFilePaths: Set<string>;
    submittedFolderPaths: Set<string>;
}) {
    const state: WorkspaceHintState = {
        hasFile: (path) =>
            args.submittedFilePaths.has(normalizeTerminalWorkspacePath(path)),
        hasFolder: (path) =>
            args.submittedFolderPaths.has(normalizeTerminalWorkspacePath(path)),
        addFile: (path) =>
            addFileToSets(path, args.submittedFilePaths, args.submittedFolderPaths),
        addFolder: (path) => addFolderToSet(path, args.submittedFolderPaths),
        removePath: (path) =>
            removePathFromSets(
                path,
                args.submittedFilePaths,
                args.submittedFolderPaths,
            ),
        filesUnder: (path) => {
            const normalized = normalizeTerminalWorkspacePath(path);
            if (!normalized) return [];
            const prefix = `${normalized}/`;
            return [...args.submittedFilePaths].filter(
                (entryPath) => entryPath === normalized || entryPath.startsWith(prefix),
            );
        },
        foldersUnder: (path) => {
            const normalized = normalizeTerminalWorkspacePath(path);
            if (!normalized) return [];
            const prefix = `${normalized}/`;
            return [...args.submittedFolderPaths].filter(
                (entryPath) => entryPath === normalized || entryPath.startsWith(prefix),
            );
        },
    };

    for (const command of collectTerminalWorkspaceCommands(args.terminalEvidence)) {
        applyWorkspaceCommandHint({ state, command });
    }
}

function addDirectoryEntry(
    entries: TerminalWorkspaceEntry[],
    seen: Set<string>,
    path: string,
) {
    const normalized = normalizeTerminalWorkspacePath(path);
    if (!normalized) return;

    const parts = normalized.split("/");
    let current = "";

    for (const part of parts) {
        current = current ? `${current}/${part}` : part;

        if (seen.has(`directory:${current}`) || seen.has(`file:${current}`)) {
            continue;
        }

        entries.push({ kind: "directory", path: current });
        seen.add(`directory:${current}`);
    }
}

function addFileEntry(
    entries: TerminalWorkspaceEntry[],
    seen: Set<string>,
    path: string,
) {
    const normalized = normalizeTerminalWorkspacePath(path);
    if (!normalized) return;

    const parent = normalized.split("/").slice(0, -1).join("/");
    if (parent) addDirectoryEntry(entries, seen, parent);

    if (seen.has(`file:${normalized}`)) return;

    entries.push({ kind: "file", path: normalized, content: "" });
    seen.add(`file:${normalized}`);
}

function removeEntryPath(
    entries: TerminalWorkspaceEntry[],
    seen: Set<string>,
    path: string,
) {
    const normalized = normalizeTerminalWorkspacePath(path);
    if (!normalized) return;

    for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        const entryPath = normalizeTerminalWorkspacePath(entry.path);

        if (entryPath === normalized || entryPath.startsWith(`${normalized}/`)) {
            const kind = entry.kind === "directory" ? "directory" : "file";
            seen.delete(`${kind}:${entryPath}`);
            entries.splice(i, 1);
        }
    }
}

export function applyTerminalWorkspaceHintsToEntries(args: {
    entries: TerminalWorkspaceEntry[];
    terminalEvidence?: TerminalWorkspaceEvidenceLike;
}) {
    const entries = [...args.entries];
    const seen = new Set<string>();

    for (const entry of entries) {
        const kind = entry.kind === "directory" ? "directory" : "file";
        const path = normalizeTerminalWorkspacePath(entry.path);
        if (path) seen.add(`${kind}:${path}`);
    }

    const state: WorkspaceHintState = {
        hasFile: (path) => seen.has(`file:${normalizeTerminalWorkspacePath(path)}`),
        hasFolder: (path) =>
            seen.has(`directory:${normalizeTerminalWorkspacePath(path)}`),
        addFile: (path) => addFileEntry(entries, seen, path),
        addFolder: (path) => addDirectoryEntry(entries, seen, path),
        removePath: (path) => removeEntryPath(entries, seen, path),
        filesUnder: (path) => {
            const normalized = normalizeTerminalWorkspacePath(path);
            if (!normalized) return [];
            const prefix = `${normalized}/`;
            return entries
                .filter((entry) => entry.kind !== "directory")
                .map((entry) => normalizeTerminalWorkspacePath(entry.path))
                .filter(
                    (entryPath) =>
                        entryPath === normalized || entryPath.startsWith(prefix),
                );
        },
        foldersUnder: (path) => {
            const normalized = normalizeTerminalWorkspacePath(path);
            if (!normalized) return [];
            const prefix = `${normalized}/`;
            return entries
                .filter((entry) => entry.kind === "directory")
                .map((entry) => normalizeTerminalWorkspacePath(entry.path))
                .filter(
                    (entryPath) =>
                        entryPath === normalized || entryPath.startsWith(prefix),
                );
        },
    };

    for (const command of collectTerminalWorkspaceCommands(args.terminalEvidence)) {
        applyWorkspaceCommandHint({ state, command });
    }

    return entries;
}
