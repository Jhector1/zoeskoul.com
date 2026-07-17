import { describe, expect, it } from "vitest";
import { createLocalSqlRunner } from "./localRunner.js";

describe("createLocalSqlRunner", () => {
    it("executes a mutation and returns the checkSql result without an external sqlite3 binary", async () => {
        const runSql = createLocalSqlRunner();

        expect(runSql).not.toBeNull();

        const result = await runSql!({
            dialect: "sqlite",
            schemaSql: `
                CREATE TABLE inventory_items (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    price REAL NOT NULL,
                    status TEXT NOT NULL DEFAULT 'draft'
                );
            `,
            seedSql: `
                INSERT INTO inventory_items (
                    id,
                    name,
                    category,
                    price,
                    status
                )
                VALUES (
                    1,
                    'Sticker Pack',
                    'Accessories',
                    4.99,
                    'active'
                );
            `,
            code: `
                INSERT INTO inventory_items (
                    name,
                    category,
                    price,
                    status
                )
                VALUES (
                    'Marker',
                    'Stationery',
                    2.50,
                    'active'
                );

                SELECT id, name
                FROM inventory_items
                WHERE name = 'Marker';
            `,
            checkSql: `
                SELECT id, name, category, price, status
                FROM inventory_items
                WHERE name = 'Marker';
            `,
        });

        expect(result).toMatchObject({
            ok: true,
            columns: ["id", "name", "category", "price", "status"],
            rows: [[2, "Marker", "Stationery", 2.5, "active"]],
        });
    });
});
