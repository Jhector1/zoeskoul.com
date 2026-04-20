import type { AiProvider } from "../types.js";
import { buildTranslationPrompt } from "../prompts/buildTranslationPrompt.js";

export async function translateMessages(
    provider: AiProvider,
    args: {
        sourceLocale: "en";
        targetLocale: string;
        messages: Record<string, unknown>;
    },
) {
    const prompt = buildTranslationPrompt(args);

    return provider.generateJson<Record<string, unknown>>({
        system: prompt.system,
        user: prompt.user,
        schemaName: "TranslatedMessages",
    });
}