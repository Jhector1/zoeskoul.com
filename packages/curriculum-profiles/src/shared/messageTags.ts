export function messageTag(messageBase: string, field: string): string {
    return `@:${messageBase}.${field}`;
}

function normalizeMessageKeySegment(value: string) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function fileContentMessageField(args: {
    group: "starterFiles" | "solutionFiles" | "files" | "fixtureFiles";
    filePath: string | undefined;
    index: number;
}): string {
    const normalizedPath = normalizeMessageKeySegment(args.filePath ?? "");
    const fileKey = normalizedPath || `file_${args.index + 1}`;
    return `${args.group}.${fileKey}.content`;
}

export function fileContentMessageTag(args: {
    messageBase: string;
    group: "starterFiles" | "solutionFiles" | "files" | "fixtureFiles";
    filePath?: string;
    index: number;
}): string {
    return messageTag(
        args.messageBase,
        fileContentMessageField({
            group: args.group,
            filePath: args.filePath,
            index: args.index,
        }),
    );
}

export function starterFileContentMessageField(
    filePath: string | undefined,
    index: number,
): string {
    return fileContentMessageField({
        group: "starterFiles",
        filePath,
        index,
    });
}

export function starterFileContentMessageTag(args: {
    messageBase: string;
    filePath?: string;
    index: number;
}): string {
    return fileContentMessageTag({
        messageBase: args.messageBase,
        group: "starterFiles",
        filePath: args.filePath,
        index: args.index,
    });
}

export function solutionFileContentMessageField(
    filePath: string | undefined,
    index: number,
): string {
    return fileContentMessageField({
        group: "solutionFiles",
        filePath,
        index,
    });
}

export function solutionFileContentMessageTag(args: {
    messageBase: string;
    filePath?: string;
    index: number;
}): string {
    return fileContentMessageTag({
        messageBase: args.messageBase,
        group: "solutionFiles",
        filePath: args.filePath,
        index: args.index,
    });
}

export function semanticCheckMessageField(index: number): string {
    return `checks.${index}.message`;
}

export function semanticCheckMessageTag(args: {
    messageBase: string;
    index: number;
}): string {
    return messageTag(args.messageBase, semanticCheckMessageField(args.index));
}
