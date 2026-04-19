import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";

export type ToolDefaults = {
    defaultLang: WorkspaceLanguage;
    defaultCode: string;
    defaultStdin: string;
    defaultSqlDialect: SqlDialect;
};

export function resolveToolDefaults(args: {
    subjectSlug: string;
    moduleMeta?: unknown;
}): ToolDefaults {
    const { subjectSlug, moduleMeta } = args;

    const meta = (moduleMeta ?? {}) as {
        toolDefaults?: Partial<ToolDefaults>;
    };

    if (meta.toolDefaults?.defaultLang) {
        return {
            defaultLang: meta.toolDefaults.defaultLang,
            defaultCode:
                meta.toolDefaults.defaultCode ??
                starterFor(meta.toolDefaults.defaultLang),
            defaultStdin: meta.toolDefaults.defaultStdin ?? "",
            defaultSqlDialect:
                meta.toolDefaults.defaultSqlDialect ?? DEFAULT_SQL_DIALECT,
        };
    }

    switch (subjectSlug) {
        case "sql":
            return {
                defaultLang: "sql",
                defaultCode: `SELECT 'Hello SQL' AS message;`,
                defaultStdin: "",
                defaultSqlDialect: DEFAULT_SQL_DIALECT,
            };

        case "java":
            return {
                defaultLang: "java",
                defaultCode: [
                    "public class Main {",
                    "    public static void main(String[] args) {",
                    '        System.out.println("Hello Java!");',
                    "    }",
                    "}",
                ].join("\n"),
                defaultStdin: "",
                defaultSqlDialect: DEFAULT_SQL_DIALECT,
            };

        case "javascript":
            return {
                defaultLang: "javascript",
                defaultCode: `console.log("Hello JavaScript!");`,
                defaultStdin: "",
                defaultSqlDialect: DEFAULT_SQL_DIALECT,
            };

        case "c":
            return {
                defaultLang: "c",
                defaultCode: [
                    "#include <stdio.h>",
                    "",
                    "int main(void) {",
                    '    printf("Hello C!\\n");',
                    "    return 0;",
                    "}",
                ].join("\n"),
                defaultStdin: "",
                defaultSqlDialect: DEFAULT_SQL_DIALECT,
            };

        case "cpp":
            return {
                defaultLang: "cpp",
                defaultCode: [
                    "#include <iostream>",
                    "using namespace std;",
                    "",
                    "int main() {",
                    '    cout << "Hello C++!" << endl;',
                    "    return 0;",
                    "}",
                ].join("\n"),
                defaultStdin: "",
                defaultSqlDialect: DEFAULT_SQL_DIALECT,
            };

        case "python":
        default:
            return {
                defaultLang: "python",
                defaultCode: `print("Hello Python!")`,
                defaultStdin: "",
                defaultSqlDialect: DEFAULT_SQL_DIALECT,
            };
    }
}

function starterFor(lang: WorkspaceLanguage): string {
    switch (lang) {
        case "sql":
            return `SELECT 'Hello SQL' AS message;`;
        case "java":
            return [
                "public class Main {",
                "    public static void main(String[] args) {",
                '        System.out.println("Hello Java!");',
                "    }",
                "}",
            ].join("\n");
        case "javascript":
            return `console.log("Hello JavaScript!");`;
        case "c":
            return [
                "#include <stdio.h>",
                "",
                "int main(void) {",
                '    printf("Hello C!\\n");',
                "    return 0;",
                "}",
            ].join("\n");
        case "cpp":
            return [
                "#include <iostream>",
                "using namespace std;",
                "",
                "int main() {",
                '    cout << "Hello C++!" << endl;',
                "    return 0;",
                "}",
            ].join("\n");
        case "python":
        default:
            return `print("Hello Python!")`;
    }
}