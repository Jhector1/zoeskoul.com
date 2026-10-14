import {
    describe,
    expect,
    it,
} from "vitest";

import {
    buildSourceChecksExpectedExample,
    buildSqlExpectedExample,
    buildTerminalExpectedExample,
} from "./expectedExample.js";

describe("shared Expected Example materialization", () => {
    it("materializes a SQL result preview by default on the canonical Node SQLite runtime", () => {
        expect(
            buildSqlExpectedExample({
                def: {},
                resolved: {
                    expectedExampleMeta:
                        "Expected result",
                },
                schemaSql: `
                    CREATE TABLE products (
                        category TEXT,
                        stock INTEGER,
                        created_at TEXT
                    );
                `,
                seedSql: `
                    INSERT INTO products VALUES
                        ('Books', 8, '2026-01-01'),
                        ('Games', 3, '2026-01-02');
                `,
                solutionCode: `
                    SELECT
                        category,
                        stock,
                        created_at
                    FROM products;
                `,
            }),
        ).toEqual({
            kind: "sql_result",
            meta: "Expected result",
            columns: [
                "category",
                "stock",
                "created_at",
            ],
            rows: [
                [
                    "Books",
                    8,
                    "2026-01-01",
                ],
                [
                    "Games",
                    3,
                    "2026-01-02",
                ],
            ],
        });
    });

    it("preserves positional values when SQL result columns share the same label", () => {
        expect(
            buildSqlExpectedExample({
                def: {
                    showExpectedExample: true,
                },
                resolved: {},
                schemaSql: "",
                seedSql: "",
                solutionCode:
                    "SELECT 1 AS id, 9 AS id, 'Ada' AS name;",
            }),
        ).toEqual({
            kind: "sql_result",
            columns: [
                "id",
                "id",
                "name",
            ],
            rows: [
                [
                    1,
                    9,
                    "Ada",
                ],
            ],
        });
    });

    it("uses checkSql for mutation previews", () => {
        expect(
            buildSqlExpectedExample({
                def: {
                    showExpectedExample: true,
                },
                resolved: {},
                schemaSql: `
                    CREATE TABLE inventory (
                        id INTEGER PRIMARY KEY,
                        stock INTEGER
                    );
                `,
                seedSql: `
                    INSERT INTO inventory
                    VALUES (1, 3);
                `,
                solutionCode: `
                    UPDATE inventory
                    SET stock = 5
                    WHERE id = 1;
                `,
                checkSql: `
                    SELECT id, stock
                    FROM inventory
                    ORDER BY id;
                `,
            }),
        ).toEqual({
            kind: "sql_result",
            columns: [
                "id",
                "stock",
            ],
            rows: [
                [
                    1,
                    5,
                ],
            ],
        });
    });

    it("honors an explicit Expected Example opt-out", () => {
        expect(
            buildSqlExpectedExample({
                def: {
                    showExpectedExample: false,
                },
                resolved: {},
                schemaSql: `
                    CREATE TABLE products (
                        category TEXT
                    );
                `,
                seedSql: `
                    INSERT INTO products
                    VALUES ('Books');
                `,
                solutionCode: `
                    SELECT category
                    FROM products;
                `,
            }),
        ).toBeNull();

        expect(
            buildTerminalExpectedExample({
                def: {
                    showExpectedExample: false,
                },
                resolved: {},
                tests: [
                    {
                        stdout: "Hello\\n",
                    },
                ],
            }),
        ).toBeNull();
    });

    it("keeps terminal Expected Examples on the same shared owner", () => {
        expect(
            buildTerminalExpectedExample({
                def: {
                    showExpectedExample: true,
                },
                resolved: {
                    expectedExampleMeta:
                        "Expected example",
                },
                tests: [
                    {
                        stdin: "Ada\n",
                        stdout: "Hello Ada\n",
                    },
                ],
            }),
        ).toEqual({
            kind: "terminal",
            meta: "Expected example",
            stdin: "Ada\n",
            stdout: "Hello Ada\n",
        });
    });

    it("uses the terminal helper for JavaScript source-check exercises", () => {
        expect(
            buildSourceChecksExpectedExample({
                def: {
                    showExpectedExample: true,
                },
                resolved: {},
                language: "javascript",
                runtimeKind: "code",
                entryPath: "main.js",
                solutionFiles: [
                    {
                        path: "main.js",
                        content: "console.log('ok');\n",
                    },
                ],
                tests: [
                    {
                        stdout: "ok\n",
                    },
                ],
            }),
        ).toEqual({
            kind: "terminal",
            stdout: "ok\n",
        });
    });

    it("uses Web Preview only for an explicit web language or runtime", () => {
        expect(
            buildSourceChecksExpectedExample({
                def: {},
                resolved: {},
                language: "web",
                runtimeKind: "web",
                entryPath: "index.html",
                solutionFiles: [
                    {
                        path: "index.html",
                        content: "<h1>Hello</h1>\n",
                    },
                ],
            }),
        ).toEqual({
            kind: "web_preview",
            entryPath: "index.html",
            files: [
                {
                    path: "index.html",
                    content: "<h1>Hello</h1>\n",
                },
            ],
        });
    });
});
