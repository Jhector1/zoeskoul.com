export type PresentableOption = {
    id: string;
    text: string;
};

export function normalizePresentableOptions(raw: unknown): PresentableOption[] {
    return (Array.isArray(raw) ? raw : []).map((o: any, i: number) => {
        const isPrimitive =
            typeof o === "string" || typeof o === "number";

        return {
            id: String(
                isPrimitive ? o : o?.id ?? o?.optionId ?? o?.value ?? o?.key ?? i
            ),
            text: String(
                isPrimitive
                    ? o
                    : o?.text ?? o?.label ?? o?.content ?? o?.latex ?? o?.contentLatex ?? ""
            ),
        };
    });
}

export function shuffleItems<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function buildStableSeedKey(values: Array<string | number>): string {
    return values.map(String).join("|");
}