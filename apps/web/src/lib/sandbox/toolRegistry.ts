import type { WorkspaceLanguage } from "@/lib/practice/types";

export type SandboxCategory = "programming" | "math";

export type ProgrammingCodeToolSlug =
    | "python"
    | "java"
    | "javascript"
    | "web"
    | "c"
    | "cpp"
    | "sql";

export type ProgrammingToolSlug = ProgrammingCodeToolSlug | "shell";

export type MathToolSlug = "linear-algebra";

export type SandboxToolSlug = ProgrammingToolSlug | MathToolSlug;

export type SandboxToolEntry =
    | {
    kind: "programming";
    category: "programming";
    toolSlug: ProgrammingCodeToolSlug;
    title: string;
    initialLanguage: WorkspaceLanguage;
    seoKey:
        | "online-python-compiler"
        | "online-java-compiler"
        | "online-javascript-editor"
        | "online-web-editor"
        | "online-c-compiler"
        | "online-cpp-compiler"
        | "online-sql-editor";
    lessonPath: string;
}
    | {
    kind: "programming";
    category: "programming";
    toolSlug: "shell";
    title: string;
    initialLanguage: WorkspaceLanguage;
    seoKey: "sandbox-shell-practice";
    lessonPath?: string;
}
    | {
    kind: "math";
    category: "math";
    toolSlug: "linear-algebra";
    title: string;
    seoKey: "sandbox-linear-algebra";
    lessonPath?: string;
};

export const PROGRAMMING_TOOL_ORDER: ProgrammingCodeToolSlug[] = [
    "python",
    "java",
    "javascript",
    "web",
    "c",
    "cpp",
    "sql",
];

export function buildSandboxToolHref(
    locale: string,
    category: SandboxCategory,
    toolSlug: SandboxToolSlug,
) {
    return `/${locale}/sandbox/${category}/${toolSlug}`;
}

export function buildProgrammingToolHref(
    locale: string,
    toolSlug: ProgrammingToolSlug,
) {
    return buildSandboxToolHref(locale, "programming", toolSlug);
}

export function resolveSandboxToolEntry(
    category: string,
    toolSlug: string,
): SandboxToolEntry | null {
    if (category === "programming") {
        switch (toolSlug) {
            case "python":
                return {
                    kind: "programming",
                    category: "programming",
                    toolSlug: "python",
                    title: "Online Python Compiler",
                    initialLanguage: "python",
                    seoKey: "online-python-compiler",
                    lessonPath: "/subjects/python/modules",
                };

            case "java":
                return {
                    kind: "programming",
                    category: "programming",
                    toolSlug: "java",
                    title: "Online Java Compiler",
                    initialLanguage: "java",
                    seoKey: "online-java-compiler",
                    lessonPath: "/subjects/java/modules",
                };

            case "javascript":
                return {
                    kind: "programming",
                    category: "programming",
                    toolSlug: "javascript",
                    title: "Online JavaScript Editor",
                    initialLanguage: "javascript",
                    seoKey: "online-javascript-editor",
                    lessonPath: "/subjects/javascript/modules",
                };

            case "web":
                return {
                    kind: "programming",
                    category: "programming",
                    toolSlug: "web",
                    title: "Online HTML CSS JS Editor",
                    initialLanguage: "web",
                    seoKey: "online-web-editor",
                    lessonPath: "/subjects/web/modules",
                };

            case "c":
                return {
                    kind: "programming",
                    category: "programming",
                    toolSlug: "c",
                    title: "Online C Compiler",
                    initialLanguage: "c",
                    seoKey: "online-c-compiler",
                    lessonPath: "/subjects/programming/modules",
                };

            case "cpp":
                return {
                    kind: "programming",
                    category: "programming",
                    toolSlug: "cpp",
                    title: "Online C++ Compiler",
                    initialLanguage: "cpp",
                    seoKey: "online-cpp-compiler",
                    lessonPath: "/subjects/cpp/modules",
                };

            case "sql":
                return {
                    kind: "programming",
                    category: "programming",
                    toolSlug: "sql",
                    title: "Online SQL Editor",
                    initialLanguage: "sql",
                    seoKey: "online-sql-editor",
                    lessonPath: "/subjects/sql/modules",
                };

            case "shell":
                return {
                    kind: "programming",
                    category: "programming",
                    toolSlug: "shell",
                    title: "Shell Practice",
                    initialLanguage: "python",
                    seoKey: "sandbox-shell-practice",
                };

            default:
                return null;
        }
    }

    if (category === "math") {
        if (toolSlug === "linear-algebra") {
            return {
                kind: "math",
                category: "math",
                toolSlug: "linear-algebra",
                title: "Linear Algebra Sandbox",
                seoKey: "sandbox-linear-algebra",
            };
        }

        return null;
    }

    return null;
}