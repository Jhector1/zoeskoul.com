import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";

export const DEFAULT_SQL_DIALECT: SqlDialect = "sqlite";

export const DEFAULT_SQL_DIALECTS: SqlDialect[] = [
    "postgres",
    "mysql",
    "sqlite",
    "mssql",
];

export const DEFAULT_LANGS: CodeLanguage[] = [
    "python",
    "java",
    "javascript",
    "c",
    "cpp",
    "sql",
];

export const DEFAULT_CODE: Record<CodeLanguage, string> = {
    python: `print("Hello from Python!")\n`,
    java: `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from Java!");\n  }\n}\n`,
    javascript: `console.log("Hello from JavaScript!");\n`,
    c: `#include <stdio.h>\n\nint main() {\n  printf("Hello from C!\\n");\n  return 0;\n}\n`,
    cpp: `#include <iostream>\n\nint main() {\n  std::cout << "Hello from C++!" << std::endl;\n  return 0;\n}\n`,
    sql: `SELECT 1 AS value;\n`,
};