import type { AiProvider } from "../types.js";

export const openAiProvider: AiProvider = {
    async generateJson<T>() {
        throw new Error("Hook up OpenAI provider here");
    },
};