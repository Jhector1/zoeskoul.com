import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import type { AiProvider, TranslatedEntries } from "../types.js";
import { buildTranslationPrompt } from "../prompts/buildTranslationPrompt.js";

export async function translateMessages(
    provider: AiProvider,
    args: {
        shape: SubjectShapePack;
        sourceLocale: string;
        locale: string;
        sourceMessages: Record<string, unknown>;
    },
): Promise<Record<string, unknown>> {
    const entries = Object.entries(args.sourceMessages)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => ({
            key,
            value: String(value),
        }));

    if (entries.length === 0) {
        return {};
    }

    const prompt = buildTranslationPrompt({
        locale: args.locale,
        sourceLocale: args.sourceLocale,
        entries,
        shape: args.shape,
    });

    const translated = await provider.generateJson<TranslatedEntries>({
        system: prompt.system,
        user: prompt.user,
        schemaName: "TranslatedEntries",
    });

    return Object.fromEntries(
        translated.entries.map((entry: { key: string; value: string }) => [
            entry.key,
            entry.value,
        ]),
    );
}