import type {
    BinaryFileContent,
    FileNode,
} from "@/components/ide/types";
import type {
    BinaryWorkspaceFileEntry,
    WorkspaceSyncEntry,
} from "@zoeskoul/code-contracts";
import {
    isBinaryWorkspaceFileEntry,
    normalizeWorkspaceBase64,
    resolveWorkspaceFileCapability,
    workspaceBase64DecodedByteLength,
} from "@zoeskoul/code-contracts";

export function isBinaryFileNode(
    file: Pick<FileNode, "binary"> | null | undefined,
): file is Pick<FileNode, "binary"> & { binary: BinaryFileContent } {
    return file?.binary?.encoding === "base64";
}

export function isBinaryWorkspaceEntry(
    entry: WorkspaceSyncEntry | null | undefined,
): entry is BinaryWorkspaceFileEntry {
    return (
        !!entry &&
        entry.kind !== "directory" &&
        isBinaryWorkspaceFileEntry(entry)
    );
}

export function normalizeBinaryFileContent(
    raw: unknown,
    fileName: string,
): BinaryFileContent | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

    const record = raw as Record<string, unknown>;
    if (record.encoding !== "base64") return undefined;

    const data = normalizeWorkspaceBase64(record.data);
    const decodedBytes = workspaceBase64DecodedByteLength(record.data);
    if (data == null || decodedBytes == null) return undefined;

    const capability = resolveWorkspaceFileCapability(fileName);
    if (!capability || capability.storage !== "binary") return undefined;

    if (
        typeof record.sizeBytes === "number" &&
        (!Number.isInteger(record.sizeBytes) ||
            record.sizeBytes < 0 ||
            record.sizeBytes !== decodedBytes)
    ) {
        return undefined;
    }

    const checksum =
        typeof record.checksum === "string" &&
        /^sha256:[a-f0-9]{64}$/i.test(record.checksum.trim())
            ? record.checksum.trim().toLowerCase()
            : undefined;

    return {
        encoding: "base64",
        data,
        // The extension registry is authoritative; do not trust uploaded MIME labels.
        mimeType: capability.mimeType,
        sizeBytes: decodedBytes,
        ...(checksum ? { checksum } : {}),
    };
}

export function workspaceFileToSyncEntry(args: {
    path: string;
    file: Pick<FileNode, "content" | "binary">;
}): WorkspaceSyncEntry {
    if (isBinaryFileNode(args.file)) {
        return {
            kind: "file",
            path: args.path,
            encoding: "base64",
            data: args.file.binary.data,
            mimeType: args.file.binary.mimeType,
            sizeBytes: args.file.binary.sizeBytes,
            ...(args.file.binary.checksum
                ? { checksum: args.file.binary.checksum }
                : {}),
        };
    }

    return {
        kind: "file",
        path: args.path,
        content: args.file.content ?? "",
    };
}

export function workspaceFileSemanticValue(
    file: Pick<FileNode, "content" | "binary">,
) {
    return isBinaryFileNode(file)
        ? `binary:${file.binary.checksum ?? ""}:${file.binary.mimeType}:${file.binary.sizeBytes}:${file.binary.data}`
        : `text:${file.content ?? ""}`;
}
