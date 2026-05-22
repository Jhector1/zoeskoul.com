import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { RunSqlFn } from "./runner.js";

type BetterSqlite3Column = {
    name: string;
};

type BetterSqlite3Database = {
    exec(sql: string): void;
    prepare(sql: string): {
        reader?: boolean;
        columns(): BetterSqlite3Column[];
        all(): Array<Record<string, unknown>>;
    };
    close(): void;
};

type BetterSqlite3Constructor = new (filename: string) => BetterSqlite3Database;
type RequireLike = (moduleName: string) => unknown;

function getBetterSqlite3(): BetterSqlite3Constructor | null {
    try {
        const req = (0, eval)("require") as RequireLike;
        return req("better-sqlite3") as BetterSqlite3Constructor;
    } catch {
        return null;
    }
}

function normalizeCell(value: unknown): string | number | boolean | null {
    if (value == null) return null;
    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    return String(value);
}

function collectTable(
    stmt: {
        columns(): BetterSqlite3Column[];
        all(): Array<Record<string, unknown>>;
    },
) {
    const columns = stmt.columns().map((column) => column.name);
    const rows = stmt.all().map((row) =>
        columns.map((column) => normalizeCell(row[column])),
    );

    return { columns, rows };
}

function splitSqlStatements(sql: string): string[] {
    return String(sql ?? "")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);
}

function runSqliteCli(dbFile: string, sql: string, json = false) {
    const args = json ? ["-json", dbFile, sql] : [dbFile, sql];
    return spawnSync("sqlite3", args, {
        encoding: "utf8",
    });
}

function createSqliteCliRunner(): RunSqlFn {
    return async (args) => {
        if ((args.dialect ?? "sqlite") !== "sqlite") {
            return {
                ok: false,
                error: `Unsupported SQL dialect "${args.dialect}" for local SQL runner.`,
            };
        }

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "zoeskoul-sql-"));
        const dbFile = path.join(tempDir, "runner.db");

        try {
            if (args.schemaSql?.trim()) {
                const schema = runSqliteCli(dbFile, args.schemaSql);
                if (schema.status !== 0) {
                    return {
                        ok: false,
                        error: schema.stderr?.trim() || "Failed to initialize SQL schema.",
                    };
                }
            }

            if (args.seedSql?.trim()) {
                const seed = runSqliteCli(dbFile, args.seedSql);
                if (seed.status !== 0) {
                    return {
                        ok: false,
                        error: seed.stderr?.trim() || "Failed to seed SQL dataset.",
                    };
                }
            }

            if (args.checkSql?.trim()) {
                const mutation = runSqliteCli(dbFile, args.code);
                if (mutation.status !== 0) {
                    return {
                        ok: false,
                        error: mutation.stderr?.trim() || "SQL statement failed to execute.",
                    };
                }

                const query = runSqliteCli(dbFile, args.checkSql, true);
                if (query.status !== 0) {
                    return {
                        ok: false,
                        error: query.stderr?.trim() || "SQL check query failed to execute.",
                    };
                }

                const parsed = JSON.parse(query.stdout || "[]") as Array<Record<string, unknown>>;
                const columns = Object.keys(parsed[0] ?? {});
                const rows = parsed.map((row) =>
                    columns.map((column) => normalizeCell(row[column])),
                );

                return {
                    ok: true,
                    columns,
                    rows,
                    tables: [{ columns, rows }],
                };
            }

            const query = runSqliteCli(dbFile, args.code, true);
            if (query.status !== 0) {
                return {
                    ok: false,
                    error: query.stderr?.trim() || "SQL query failed to execute.",
                };
            }

            const parsed = JSON.parse(query.stdout || "[]") as Array<Record<string, unknown>>;
            const columns = Object.keys(parsed[0] ?? {});
            const rows = parsed.map((row) =>
                columns.map((column) => normalizeCell(row[column])),
            );

            return {
                ok: true,
                columns,
                rows,
                tables: [{ columns, rows }],
            };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            };
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    };
}

export function createLocalSqlRunner(): RunSqlFn | null {
    const BetterSqlite3 = getBetterSqlite3();
    if (!BetterSqlite3) {
        return createSqliteCliRunner();
    }

    return async (args) => {
        if ((args.dialect ?? "sqlite") !== "sqlite") {
            return {
                ok: false,
                error: `Unsupported SQL dialect "${args.dialect}" for local SQL runner.`,
            };
        }

        const db = new BetterSqlite3(":memory:");

        try {
            if (args.schemaSql?.trim()) {
                db.exec(args.schemaSql);
            }
            if (args.seedSql?.trim()) {
                db.exec(args.seedSql);
            }

            if (args.checkSql?.trim()) {
                if (args.code.trim()) {
                    db.exec(args.code);
                }

                const stmt = db.prepare(args.checkSql);
                if (stmt.reader === false) {
                    return {
                        ok: false,
                        error: "SQL checkSql must return a result table.",
                    };
                }

                const table = collectTable(stmt);
                return {
                    ok: true,
                    columns: table.columns,
                    rows: table.rows,
                    tables: [table],
                };
            }

            const statements = splitSqlStatements(args.code);
            const lastStatement = statements.pop() ?? args.code.trim();

            for (const statement of statements) {
                db.exec(statement);
            }

            const stmt = db.prepare(lastStatement);
            if (stmt.reader === false) {
                db.exec(lastStatement);
                return {
                    ok: true,
                    columns: [],
                    rows: [],
                    tables: [],
                };
            }

            const table = collectTable(stmt);
            return {
                ok: true,
                columns: table.columns,
                rows: table.rows,
                tables: [table],
            };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            };
        } finally {
            db.close();
        }
    };
}
