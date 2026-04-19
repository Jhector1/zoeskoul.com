import { extractInputPromptsPython, countPythonInputs } from "./input.python";
import { extractJavaPrintPrompts, countJavaInputs } from "./input.java";
import { extractCPrintfPrompts, countCInputs } from "./input.c";
import { extractCppCoutPrompts, countCppInputs } from "./input.cpp";
import type { WorkspaceLanguage } from "@/lib/practice/types";

export function inferInputPlan(lang: WorkspaceLanguage, code: string) {
    if (lang === "sql") {
        return { expected: 0, prompts: [] as string[] };
    }

    if (lang === "python") {
        const prompts = extractInputPromptsPython(code);
        const expected = countPythonInputs(code);
        return { expected, prompts };
    }

    if (lang === "java") {
        const prompts = extractJavaPrintPrompts(code);
        const expected = countJavaInputs(code);
        return { expected, prompts };
    }

    if (lang === "c") {
        const prompts = extractCPrintfPrompts(code);
        const expected = countCInputs(code);
        return { expected, prompts };
    }

    if (lang === "cpp") {
        const prompts = extractCppCoutPrompts(code);
        const expected = countCppInputs(code);
        return { expected, prompts };
    }

    return { expected: 0, prompts: [] as string[] };
}