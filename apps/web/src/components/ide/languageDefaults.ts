import type { WorkspaceLanguage } from "@/lib/practice/types";

export function defaultExt(lang: WorkspaceLanguage): string {
    switch (lang) {
        case "python":
            return ".py";
        case "java":
            return ".java";
        case "javascript":
            return ".js";
        case "c":
            return ".c";
        case "cpp":
            return ".cpp";
        case "bash":
            return ".sh";
        case "sql":
            return ".sql";
        case "web":
            return ".html";
        default:
            return ".txt";
    }
}

export function defaultMainFile(lang: WorkspaceLanguage): string {
    switch (lang) {
        case "python":
            return "main.py";
        case "java":
            return "Main.java";
        case "javascript":
            return "main.js";
        case "c":
            return "main.c";
        case "cpp":
            return "main.cpp";
        case "bash":
            return "main.sh";
        case "sql":
            return "query.sql";
        case "web":
            return "index.html";
        default:
            return "main.txt";
    }
}

export function defaultMainCode(lang: WorkspaceLanguage): string {
    switch (lang) {
        case "python":
            return `print("Hello from Python!")\n`;
        case "java":
            return `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from Java!");\n  }\n}\n`;
        case "javascript":
            return `console.log("Hello from JavaScript!");\n`;
        case "c":
            return `#include <stdio.h>\n\nint main() {\n  printf("Hello from C!\\n");\n  return 0;\n}\n`;
        case "cpp":
            return `#include <iostream>\n\nint main() {\n  std::cout << "Hello from C++!" << std::endl;\n  return 0;\n}\n`;
        case "bash":
            return `echo "Hello from Bash!"\n`;
        case "sql":
            return `SELECT 1 AS value;\n`;
        case "web":
            return `<!doctype html>
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
`;
        default:
            return "";
    }
}

export function defaultWebCssCode(): string {
    return `:root {
  color-scheme: light dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, sans-serif;
}

.app {
  padding: 24px;
}

h1 {
  margin-top: 0;
}

button {
  padding: 10px 14px;
  cursor: pointer;
}

#out {
  margin-top: 12px;
  font-weight: 700;
}
`;
}

export function defaultWebJsCode(): string {
    return `const btn = document.getElementById("btn");
const out = document.getElementById("out");

if (btn && out) {
  btn.addEventListener("click", () => {
    out.textContent = "Button clicked";
  });
}
`;
}

export function defaultSqlSchemaCode(): string {
    return `CREATE TABLE users (
                                   id INTEGER PRIMARY KEY,
                                   name TEXT NOT NULL,
                                   email TEXT UNIQUE
            );

    CREATE TABLE orders (
                            id INTEGER PRIMARY KEY,
                            user_id INTEGER NOT NULL,
                            total NUMERIC NOT NULL,
                            created_at TEXT,
                            FOREIGN KEY (user_id) REFERENCES users(id)
    );
    `;
}

export function defaultSqlSeedCode(): string {
    return `INSERT INTO users (id, name, email) VALUES
                                                    (1, 'Ada', 'ada@example.com'),
                                                    (2, 'Linus', 'linus@example.com');

    INSERT INTO orders (id, user_id, total, created_at) VALUES
                                                            (101, 1, 49.99, '2026-03-21'),
                                                            (102, 2, 19.50, '2026-03-22');
    `;
}
