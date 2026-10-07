type ClientTranslator = {
    (key: string, values?: Record<string, unknown>): string;
    has?: (key: string) => boolean;
};

export function getOptionalClientMessage(
    t: ClientTranslator,
    key: string,
    fallback: string,
) {
    return t.has?.(key) ? t(key) : fallback;
}