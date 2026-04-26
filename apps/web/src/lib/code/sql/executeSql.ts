import "server-only";

import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
    RunResult,
    SqlColumn,
    SqlRunReq,
    SqlRunResult,
    SqlScalar,
} from "../types";
import { renderAsciiTable } from "./formatAsciiTable";

const DEFAULT_SQL_LIMITS = {
    statementTimeoutMs: 4000,
    maxRows: 200,
    maxBytes: 128_000,
};

function clampNumber(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function normalizeSqlReq(req: SqlRunReq): SqlRunReq {
    const limits = req.limits ?? {};

    return {
        ...req,
        schemaSql: req.schemaSql ?? req.setupSql,
        checkSql:
            typeof req.checkSql === "string" && req.checkSql.trim()
                ? req.checkSql.trim()
                : undefined,
        limits: {
            statementTimeoutMs: clampNumber(
                Number(limits.statementTimeoutMs ?? DEFAULT_SQL_LIMITS.statementTimeoutMs),
                250,
                15_000,
            ),
            maxRows: clampNumber(
                Number(limits.maxRows ?? DEFAULT_SQL_LIMITS.maxRows),
                1,
                1000,
            ),
            maxBytes: clampNumber(
                Number(limits.maxBytes ?? DEFAULT_SQL_LIMITS.maxBytes),
                2048,
                512_000,
            ),
        },
    };
}

function byteLen(s: string) {
    return Buffer.byteLength(String(s ?? ""), "utf8");
}

function normalizeCell(v: unknown): SqlScalar {
    if (v == null) return null;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        return v;
    }
    return JSON.stringify(v);
}

function okSql(args: Omit<SqlRunResult, "kind" | "ok" | "status">): SqlRunResult {
    return {
        kind: "sql",
        ok: true,
        status: "Accepted",
        ...args,
    };
}

function errSql(dialect: SqlRunReq["dialect"], message: string): SqlRunResult {
    return {
        kind: "sql",
        ok: false,
        status: "Error",
        dialect,
        error: message,
        stderr: message,
    };
}

function timeoutSql(
    dialect: SqlRunReq["dialect"],
    message = "SQL execution timed out.",
): SqlRunResult {
    return {
        kind: "sql",
        ok: false,
        status: "Timeout",
        dialect,
        error: message,
        stderr: message,
    };
}

function workerUrlForDialect(dialect: SqlRunReq["dialect"]) {
    if (dialect === "postgres") return process.env.SQL_RUNNER_POSTGRES_URL ?? null;
    if (dialect === "mysql") return process.env.SQL_RUNNER_MYSQL_URL ?? null;
    if (dialect === "mssql") return process.env.SQL_RUNNER_MSSQL_URL ?? null;
    if (dialect === "sqlite") return process.env.SQL_RUNNER_SQLITE_URL ?? null;
    return null;
}

function startTimeoutAbort(ms: number) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);

    return {
        signal: ctrl.signal,
        cleanup() {
            clearTimeout(id);
        },
    };
}

function limitTextBytes(text: string, maxBytes: number) {
    const src = String(text ?? "");

    if (byteLen(src) <= maxBytes) {
        return { text: src, truncated: false };
    }

    let lo = 0;
    let hi = src.length;

    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const candidate = src.slice(0, mid);

        if (byteLen(candidate) <= maxBytes) lo = mid;
        else hi = mid - 1;
    }

    return {
        text: src.slice(0, lo),
        truncated: true,
    };
}

async function executeViaRemoteWorker(req: SqlRunReq, url: string): Promise<SqlRunResult> {
    const normalized = normalizeSqlReq(req);
    const timeout = startTimeoutAbort(
        (normalized.limits?.statementTimeoutMs ?? 4000) + 1500,
    );

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(normalized),
            cache: "no-store",
            signal: timeout.signal,
        });

        const text = await res.text();

        let data: any;

        try {
            data = JSON.parse(text);
        } catch {
            return errSql(
                normalized.dialect,
                `Non-JSON SQL worker response (${res.status}): ${text.slice(0, 300)}`,
            );
        }

        if (!res.ok) {
            return errSql(
                normalized.dialect,
                data?.error ?? data?.message ?? `SQL worker failed (${res.status})`,
            );
        }

        if (!data || data.kind !== "sql") {
            return errSql(normalized.dialect, "SQL worker returned an invalid payload.");
        }

        return data as SqlRunResult;
    } catch (e: any) {
        if (e?.name === "AbortError") {
            return timeoutSql(normalized.dialect);
        }

        return errSql(normalized.dialect, e?.message ?? "SQL worker request failed.");
    } finally {
        timeout.cleanup();
    }
}

type SqlTableSnapshot = {
    name: string;
    columns: SqlColumn[];
    rows: SqlScalar[][];
    rowCount: number;
};

async function readSqliteTableSnapshots(args: {
    db: any;
    maxRows: number;
    maxBytes: number;
}): Promise<Record<string, SqlTableSnapshot>> {
    const { db, maxRows, maxBytes } = args;

    const tableRows = db
        .prepare(
            `
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY name ASC
            `,
        )
        .all() as Array<{ name: string }>;

    const snapshots: Record<string, SqlTableSnapshot> = {};

    for (const t of tableRows) {
        const tableName = String(t.name ?? "").trim();
        if (!tableName) continue;

        const escaped = tableName.replace(/"/g, `""`);

        const stmt = db.prepare(`SELECT * FROM "${escaped}"`);
        const columns: SqlColumn[] = stmt.columns().map((c: any) => ({
            name: String(c?.name ?? ""),
            type: c?.type ? String(c.type) : null,
        }));

        const countRow = db
            .prepare(`SELECT COUNT(*) as count FROM "${escaped}"`)
            .get() as { count?: number } | undefined;

        const totalCount = Number(countRow?.count ?? 0);

        const rows: SqlScalar[][] = [];
        let usedBytes = 0;

        for (const obj of stmt.iterate()) {
            if (rows.length >= maxRows) break;

            const row = columns.map((col) =>
                normalizeCell((obj as Record<string, unknown>)[col.name]),
            );

            const rowBytes = byteLen(JSON.stringify(row));
            if (usedBytes + rowBytes > maxBytes) break;

            usedBytes += rowBytes;
            rows.push(row);
        }

        snapshots[tableName] = {
            name: tableName,
            columns,
            rows,
            rowCount: totalCount,
        };
    }

    return snapshots;
}

function collectRowsFromReader(args: {
    stmt: any;
    maxRows: number;
    maxBytes: number;
}) {
    const { stmt, maxRows, maxBytes } = args;

    const columns: SqlColumn[] = stmt.columns().map((c: any) => ({
        name: String(c?.name ?? ""),
        type: c?.type ? String(c.type) : null,
    }));

    const rows: SqlScalar[][] = [];
    let truncatedByRows = false;
    let truncatedByBytes = false;
    let usedBytes = 0;

    for (const obj of stmt.iterate()) {
        if (rows.length >= maxRows) {
            truncatedByRows = true;
            break;
        }

        const row = columns.map((col) =>
            normalizeCell((obj as Record<string, unknown>)[col.name]),
        );

        const rowBytes = byteLen(JSON.stringify(row));

        if (usedBytes + rowBytes > maxBytes) {
            truncatedByBytes = true;
            break;
        }

        usedBytes += rowBytes;
        rows.push(row);
    }

    return {
        columns,
        rows,
        truncatedByRows,
        truncatedByBytes,
    };
}

async function executeSqliteLocally(req: SqlRunReq): Promise<SqlRunResult> {
    const normalized = normalizeSqlReq(req);
    const dbFile = join(tmpdir(), `zoeskoul-sql-${randomUUID()}.db`);

    let db: any = null;
    let timedOut = false;
    let interruptId: ReturnType<typeof setTimeout> | null = null;

    try {
        if (!normalized.code.trim()) {
            return errSql(normalized.dialect, "SQL query is empty.");
        }

        const mod = await import("better-sqlite3");
        const BetterSqlite3 = (mod as any).default ?? mod;

        db = new BetterSqlite3(dbFile);
        db.pragma("foreign_keys = ON");
        db.pragma("journal_mode = MEMORY");
        db.pragma("temp_store = MEMORY");
        db.pragma(
            `busy_timeout = ${Math.min(
                normalized.limits?.statementTimeoutMs ?? 4000,
                5000,
            )}`,
        );

        interruptId = setTimeout(() => {
            timedOut = true;
            try {
                db?.interrupt?.();
            } catch {}
        }, normalized.limits?.statementTimeoutMs ?? 4000);

        if (normalized.schemaSql?.trim()) {
            db.exec(normalized.schemaSql);
        }

        if (normalized.seedSql?.trim()) {
            db.exec(normalized.seedSql);
        }

        const started = Date.now();
        const maxRows = Math.max(1, normalized.limits?.maxRows ?? 200);
        const maxBytes = Math.max(2048, normalized.limits?.maxBytes ?? 128_000);

        if (normalized.checkSql?.trim()) {
            db.exec(normalized.code);

            const checkStmt = db.prepare(normalized.checkSql);

            if (!checkStmt.reader) {
                return errSql(normalized.dialect, "SQL checkSql must return a result table.");
            }

            const collected = collectRowsFromReader({
                stmt: checkStmt,
                maxRows,
                maxBytes,
            });

            const tableSnapshots = await readSqliteTableSnapshots({
                db,
                maxRows,
                maxBytes,
            });

            const elapsedMs = Date.now() - started;
            const notices: string[] = [];

            if (collected.truncatedByRows) notices.push(`Showing first ${maxRows} rows.`);
            if (collected.truncatedByBytes) notices.push(`Output truncated to ${maxBytes} bytes.`);

            const rendered = renderAsciiTable(
                collected.columns.map((c) => c.name),
                collected.rows,
            );

            const limitedStdout = limitTextBytes(rendered, maxBytes);

            if (
                limitedStdout.truncated &&
                !notices.includes(`Output truncated to ${maxBytes} bytes.`)
            ) {
                notices.push(`Output truncated to ${maxBytes} bytes.`);
            }

            return okSql({
                dialect: normalized.dialect,
                columns: collected.columns,
                rows: collected.rows,
                rowCount: collected.rows.length,
                notices,
                stdout: limitedStdout.text,
                time: (elapsedMs / 1000).toFixed(3),
                tableSnapshots,
            } as any);
        }

        const stmt = db.prepare(normalized.code);

        if (stmt.reader) {
            const collected = collectRowsFromReader({
                stmt,
                maxRows,
                maxBytes,
            });

            const tableSnapshots = await readSqliteTableSnapshots({
                db,
                maxRows,
                maxBytes,
            });

            const elapsedMs = Date.now() - started;
            const notices: string[] = [];

            if (collected.truncatedByRows) notices.push(`Showing first ${maxRows} rows.`);
            if (collected.truncatedByBytes) notices.push(`Output truncated to ${maxBytes} bytes.`);

            const rendered = renderAsciiTable(
                collected.columns.map((c) => c.name),
                collected.rows,
            );

            const limitedStdout = limitTextBytes(rendered, maxBytes);

            if (
                limitedStdout.truncated &&
                !notices.includes(`Output truncated to ${maxBytes} bytes.`)
            ) {
                notices.push(`Output truncated to ${maxBytes} bytes.`);
            }

            return okSql({
                dialect: normalized.dialect,
                columns: collected.columns,
                rows: collected.rows,
                rowCount: collected.rows.length,
                notices,
                stdout: limitedStdout.text,
                time: (elapsedMs / 1000).toFixed(3),
                tableSnapshots,
            } as any);
        }

        const info = stmt.run();
        const affected = Number(info?.changes ?? 0);

        const tableSnapshots = await readSqliteTableSnapshots({
            db,
            maxRows,
            maxBytes,
        });

        const elapsedMs = Date.now() - started;

        return okSql({
            dialect: normalized.dialect,
            affectedRows: affected,
            rowCount: affected,
            stdout: `Query OK. ${affected} row(s) affected.`,
            time: (elapsedMs / 1000).toFixed(3),
            tableSnapshots,
        } as any);
    } catch (e: any) {
        if (timedOut) {
            return timeoutSql(normalized.dialect);
        }

        return errSql(normalized.dialect, e?.message ?? "SQLite execution failed.");
    } finally {
        if (interruptId) clearTimeout(interruptId);

        try {
            db?.close?.();
        } catch {}

        try {
            await rm(dbFile, { force: true });
        } catch {}
    }
}

export async function executeSqlRun(req: SqlRunReq): Promise<RunResult> {
    const normalized = normalizeSqlReq(req);
    const remote = workerUrlForDialect(normalized.dialect);

    if (remote) {
        return executeViaRemoteWorker(normalized, remote);
    }

    if (normalized.dialect === "sqlite") {
        return executeSqliteLocally(normalized);
    }

    return errSql(
        normalized.dialect,
        `No SQL worker is configured for "${normalized.dialect}". Set ${
            normalized.dialect === "postgres"
                ? "SQL_RUNNER_POSTGRES_URL"
                : normalized.dialect === "mysql"
                    ? "SQL_RUNNER_MYSQL_URL"
                    : "SQL_RUNNER_MSSQL_URL"
        } or switch this lesson to SQLite.`,
    );
}