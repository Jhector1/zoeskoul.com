import { describe, expect, it } from "vitest";
import { compileSqlWorkspace } from "./compileSqlWorkspace.js";

describe("compileSqlWorkspace", () => {
    it("combines schema, seed, and query files in authored order", () => {
        const sql = compileSqlWorkspace({
            files: [
                { path: "query.sql", content: "SELECT * FROM products;" },
                {
                    path: "schema.sql",
                    content: "CREATE TABLE products (id INTEGER PRIMARY KEY);",
                },
                {
                    path: "seed.sql",
                    content: "INSERT INTO products (id) VALUES (1);",
                },
            ],
            fileOrder: ["schema.sql", "seed.sql", "query.sql"],
        });

        expect(sql).toBe([
            "-- file: schema.sql",
            "CREATE TABLE products (id INTEGER PRIMARY KEY);",
            "",
            "-- file: seed.sql",
            "INSERT INTO products (id) VALUES (1);",
            "",
            "-- file: query.sql",
            "SELECT * FROM products;",
        ].join("\n"));
    });

    it("rejects an order that omits a workspace file", () => {
        expect(() =>
            compileSqlWorkspace({
                files: {
                    "schema.sql": "CREATE TABLE products (id INTEGER);",
                    "query.sql": "SELECT * FROM products;",
                },
                fileOrder: ["query.sql"],
            }),
        ).toThrow(/every workspace file exactly once/i);
    });
});
