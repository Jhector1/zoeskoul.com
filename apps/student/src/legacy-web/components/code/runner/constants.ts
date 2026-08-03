import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";

export const DEFAULT_SQL_DIALECT: SqlDialect = "sqlite";

export const DEFAULT_SQL_DIALECTS: SqlDialect[] = [
    "postgres",
    "mysql",
    "sqlite",
    "mssql",
];

export const DEFAULT_LANGS: WorkspaceLanguage[] = [
    "python",
    "java",
    "javascript",
    "c",
    "cpp",
    "bash",
    "sql",
    "web",
];

export const DEFAULT_CODE: Record<WorkspaceLanguage, string> = {
    python: `print("Hello from Python!")\n`,
    java: `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from Java!");\n  }\n}\n`,
    javascript: `console.log("Hello from JavaScript!");\n`,
    c: `#include <stdio.h>\n\nint main() {\n  printf("Hello from C!\\n");\n  return 0;\n}\n`,
    cpp: `#include <iostream>\n\nint main() {\n  std::cout << "Hello from C++!" << std::endl;\n  return 0;\n}\n`,
    bash: `echo "Hello from Bash!"\n`,
    sql: `SELECT 1 AS value;\n`,
    web: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Web Preview</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="app">
      <h1>Hello web workspace</h1>
      <p>Edit HTML, CSS, and JS together.</p>
      <button id="btn">Click me</button>
      <div id="out"></div>
    </main>
    <script src="./script.js"></script>
  </body>
</html>
`,
};