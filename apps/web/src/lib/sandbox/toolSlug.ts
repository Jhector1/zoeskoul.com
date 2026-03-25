import type { CodeLanguage } from "@/lib/practice/types";

export type ToolSlug =
    | "online-python-compiler"
    | "online-java-compiler"
    | "online-javascript-editor"
    | "online-c-compiler"
    | "online-cpp-compiler"
    | "online-sql-editor"
    | "programming"
    | "linear-algebra";

export function languageFromToolSlug(slug: string): CodeLanguage | null {
    switch (slug) {
        case "online-python-compiler":
            return "python";
        case "online-java-compiler":
            return "java";
        case "online-javascript-editor":
            return "javascript";
        case "online-c-compiler":
            return "c";
        case "online-cpp-compiler":
            return "cpp";
        case "online-sql-editor":
            return "sql";
        default:
            return null;
    }
}