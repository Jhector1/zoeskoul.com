export function messageTag(messageBase: string, field: string): string {
    return `@:${messageBase}.${field}`;
}

function normalizeMessageKeySegment(value: string): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function starterFileContentMessageField(
    filePath: string | undefined,
    index: number,
): string {
    const normalizedPath = normalizeMessageKeySegment(filePath ?? "");
    const fileKey = normalizedPath || `file_${index + 1}`;
    return `starterFiles.${fileKey}.content`;
}

export function starterFileContentMessageTag(args: {
    messageBase: string;
    filePath?: string;
    index: number;
}): string {
    return messageTag(
        args.messageBase,
        starterFileContentMessageField(args.filePath, args.index),
    );
}
