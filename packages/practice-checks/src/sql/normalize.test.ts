import { describe, expect, it } from "vitest";
import {
    formatSqlDisplayValue,
    normalizeSqlDefinitionText,
    sqlTablesEqual,
} from "./normalize.js";

describe("sqlTablesEqual", () => {
    it("accepts equivalent floating-point results within shared SQL tolerance", () => {
        expect(
            sqlTablesEqual(
                {
                    columns: ["discounted_unit_price"],
                    rows: [[38.4], [55.8]],
                },
                {
                    columns: ["discounted_unit_price"],
                    rows: [[38.400000000000006], [55.800000000000004]],
                },
            ),
        ).toBe(true);
    });

    it("still rejects materially different numeric results", () => {
        expect(
            sqlTablesEqual(
                {
                    columns: ["discounted_unit_price"],
                    rows: [[38.4]],
                },
                {
                    columns: ["discounted_unit_price"],
                    rows: [[38.41]],
                },
            ),
        ).toBe(false);
    });

    it("accepts equivalent sqlite_master SQL with different formatting", () => {
        expect(
            sqlTablesEqual(
                {
                    columns: ["sql"],
                    rows: [[
                        [
                            "CREATE TABLE products (",
                            "  product_id INTEGER PRIMARY KEY,",
                            "  product_name TEXT NOT NULL,",
                            "  price REAL",
                            ")",
                        ].join("\n"),
                    ]],
                },
                {
                    columns: ["sql"],
                    rows: [[
                        "create table products(product_id integer primary key, product_name text not null, price real)",
                    ]],
                },
            ),
        ).toBe(true);
    });

    it("still rejects a materially different table definition", () => {
        expect(
            sqlTablesEqual(
                {
                    columns: ["sql"],
                    rows: [[
                        "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
                    ]],
                },
                {
                    columns: ["sql"],
                    rows: [[
                        "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT)",
                    ]],
                },
            ),
        ).toBe(false);
    });

    it("preserves quoted default values while normalizing DDL presentation", () => {
        expect(
            normalizeSqlDefinitionText(
                "CREATE TABLE items (status TEXT DEFAULT 'ACTIVE')",
            ),
        ).not.toBe(
            normalizeSqlDefinitionText(
                "create table items(status text default 'active')",
            ),
        );
    });

    it("uses the same tolerant comparison when row order is ignored", () => {
        expect(
            sqlTablesEqual(
                {
                    columns: ["order_id", "value"],
                    rows: [
                        [102, 55.8],
                        [101, 38.4],
                    ],
                },
                {
                    columns: ["order_id", "value"],
                    rows: [
                        [101, 38.400000000000006],
                        [102, 55.800000000000004],
                    ],
                },
                true,
            ),
        ).toBe(true);
    });
});

describe("formatSqlDisplayValue", () => {
    it("renders equivalent SQLite floating-point artifacts identically", () => {
        expect(formatSqlDisplayValue(38.400000000000006)).toBe("38.4");
        expect(formatSqlDisplayValue(38.4)).toBe("38.4");
        expect(formatSqlDisplayValue(55.800000000000004)).toBe("55.8");
        expect(formatSqlDisplayValue(9.025000000000002)).toBe("9.025");
    });

    it("preserves integers, text, booleans, and NULL display semantics", () => {
        expect(formatSqlDisplayValue(1234567890123456)).toBe("1234567890123456");
        expect(formatSqlDisplayValue(-0)).toBe("0");
        expect(formatSqlDisplayValue("00101")).toBe("00101");
        expect(formatSqlDisplayValue(true)).toBe("true");
        expect(formatSqlDisplayValue(null)).toBe("NULL");
    });
});
