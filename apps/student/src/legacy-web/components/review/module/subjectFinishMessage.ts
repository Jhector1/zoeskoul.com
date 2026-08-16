type ClientTranslator = {
    (key: string, values?: Record<string, unknown>): string;
    has?: (key: string) => boolean;
};

export function subjectFinishMessageKey(
    value: string | null | undefined,
): string | null {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("@:")) {
        const key = trimmed.slice(2).trim();
        return key || null;
    }

    // Accept an untagged canonical key defensively, but do not treat ordinary
    // prose containing spaces as an i18n key.
    if (
        !trimmed.includes(" ") &&
        /^(?:subjects|review)\.[A-Za-z0-9_.-]+$/.test(trimmed)
    ) {
        return trimmed;
    }

    return null;
}

export function resolveSubjectFinishDisplayMessage(args: {
    serverMessage: string | null | undefined;
    fallback: string;
    t: ClientTranslator;
}): string {
    const serverMessage = String(args.serverMessage ?? "").trim();
    if (!serverMessage) return args.fallback;

    const key = subjectFinishMessageKey(serverMessage);
    if (!key) return serverMessage;

    if (args.t.has?.(key)) {
        const resolved = String(args.t(key) ?? "").trim();
        if (
            resolved &&
            resolved !== key &&
            resolved !== `@:${key}`
        ) {
            return resolved;
        }
    }

    return args.fallback;
}
