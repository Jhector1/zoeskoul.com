import type { WorkspaceLanguage } from "@/lib/practice/types";

export function monacoLang(l: WorkspaceLanguage) {
    if (l === "python") return "python";
    if (l === "java") return "java";
    if (l === "javascript") return "javascript";
    if (l === "sql") return "sql";
    return "cpp";
}