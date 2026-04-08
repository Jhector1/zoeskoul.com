import { tag } from "@/lib/practice/generator/shared/i18n";

export function t(key?: string | null) {
    return key ? tag(key) : "";
}

export function resolveHelp(base: string) {
    const out: Record<string, string> = {};

    const concept = tag(`${base}.help.concept`);
    const hint1 = tag(`${base}.help.hint_1`);
    const hint2 = tag(`${base}.help.hint_2`);

    if (concept !== `${base}.help.concept`) out.concept = concept;
    if (hint1 !== `${base}.help.hint_1`) out.hint_1 = hint1;
    if (hint2 !== `${base}.help.hint_2`) out.hint_2 = hint2;

    return Object.keys(out).length ? out : undefined;
}

export function resolveOptionsByIds(base: string, ids: string[]) {
    return ids.map((id) => ({
        id,
        text: tag(`${base}.options.${id}`),
    }));
}

export function resolveTokensByIds(base: string, ids: string[]) {
    return ids.map((id) => ({
        id,
        text: tag(`${base}.tokens.${id}`),
    }));
}

export function resolveChoicesByCount(base: string, count: number) {
    return Array.from({ length: count }, (_, i) => tag(`${base}.choices.${i}`));
}