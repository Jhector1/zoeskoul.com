import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { RunSqlFn } from "./runner.js";

type SqliteColumn = {
    name: string;
};

type SqliteStatement = {
    reader?: boolean;
    columns(): SqliteColumn[];
    all(): Array<Record<string, unknown>>;
};

type SqliteDatabase = {
    exec(sql: string): void;
    prepare(sql: string): SqliteStatement;
    close(): void;
};

type SqliteDatabaseConstructor = new (filename: string) => SqliteDatabase;

function getInProcessSqlite(): SqliteDatabaseConstructor | null {
    const require = createRequire(import.meta.url);

    try {
        const nodeSqlite = require("node:sqlite") as {
            DatabaseSync?: SqliteDatabaseConstructor;
        };
        if (typeof nodeSqlite.DatabaseSync === "function") {
            return nodeSqlite.DatabaseSync;
        }
    } catch {
        // Older Node versions may not provide node:sqlite.
    }

    try {
        const loaded = require("better-sqlite3") as
            | SqliteDatabaseConstructor
            | { default?: SqliteDatabaseConstructor };
        const constructor =
            typeof loaded === "function" ? loaded : loaded.default;
        return typeof constructor === "function" ? constructor : null;
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
    stmt: SqliteStatement,
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

function formatSqliteCliError(
    result: ReturnType<typeof spawnSync>,
    fallback: string,
): string {
    const stderr =
        typeof result.stderr === "string" ? result.stderr.trim() : "";
    const processError = result.error?.message?.trim() ?? "";
    return stderr || processError || fallback;
}

function hasSqliteCli(): boolean {
    const probe = spawnSync("sqlite3", ["--version"], {
        encoding: "utf8",
    });
    return !probe.error && probe.status === 0;
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
                        error: formatSqliteCliError(
                            schema,
                            "Failed to initialize SQL schema.",
                        ),
                    };
                }
            }

            if (args.seedSql?.trim()) {
                const seed = runSqliteCli(dbFile, args.seedSql);
                if (seed.status !== 0) {
                    return {
                        ok: false,
                        error: formatSqliteCliError(
                            seed,
                            "Failed to seed SQL dataset.",
                        ),
                    };
                }
            }

            if (args.checkSql?.trim()) {
                const mutation = runSqliteCli(dbFile, args.code);
                if (mutation.status !== 0) {
                    return {
                        ok: false,
                        error: formatSqliteCliError(
                            mutation,
                            "SQL statement failed to execute.",
                        ),
                    };
                }

                const query = runSqliteCli(dbFile, args.checkSql, true);
                if (query.status !== 0) {
                    return {
                        ok: false,
                        error: formatSqliteCliError(
                            query,
                            "SQL check query failed to execute.",
                        ),
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
                    error: formatSqliteCliError(
                        query,
                        "SQL query failed to execute.",
                    ),
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
    const Sqlite = getInProcessSqlite();
    if (!Sqlite) {
        return hasSqliteCli() ? createSqliteCliRunner() : null;
    }

    return async (args) => {
        if ((args.dialect ?? "sqlite") !== "sqlite") {
            return {
                ok: false,
                error: `Unsupported SQL dialect "${args.dialect}" for local SQL runner.`,
            };
        }

        const db = new Sqlite(":memory:");

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
                const columns = stmt.columns();
                if (stmt.reader === false || columns.length === 0) {
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
            const columns = stmt.columns();
            if (stmt.reader === false || columns.length === 0) {
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
