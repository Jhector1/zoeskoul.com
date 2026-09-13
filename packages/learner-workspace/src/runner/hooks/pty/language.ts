import {
    isInteractiveLanguage,
    type InteractiveLanguage,
} from "@zoeskoul/code-contracts";

export type PtyRunnerLanguage = InteractiveLanguage | "bash";

export function isPtyRunnerLanguage(
    language: string,
): language is PtyRunnerLanguage {
    return language === "bash" || isInteractiveLanguage(language);
}

export function unsupportedPtyRunnerLanguageMessage(language: string) {
    return language === "sql"
        ? "PTY runner does not support SQL. Use the SQL runner instead.\r\n"
        : `PTY runner does not support ${language}.\r\n`;
}
