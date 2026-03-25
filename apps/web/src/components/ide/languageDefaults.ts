import { CodeLanguage } from "@/lib/practice/types";

export function defaultExt(lang: CodeLanguage) {
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
        case "sql":
            return ".sql";
    }
}

export function defaultMainFile(lang: CodeLanguage) {
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
        case "sql":
            return "query.sql";
    }
}

export function defaultMainCode(lang: CodeLanguage) {
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
        case "sql":
            return `SELECT *
FROM users;
`;
    }
}

export function defaultSqlSchemaCode() {
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

export function defaultSqlSeedCode() {
    return `INSERT INTO users (id, name, email) VALUES
(1, 'Ada', 'ada@example.com'),
(2, 'Linus', 'linus@example.com');

INSERT INTO orders (id, user_id, total, created_at) VALUES
(101, 1, 49.99, '2026-03-21'),
(102, 2, 19.50, '2026-03-22');
`;
}