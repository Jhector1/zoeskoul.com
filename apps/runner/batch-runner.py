#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

REQUEST_PATH = Path(os.environ.get("BATCH_REQUEST_PATH", "/workspace/.zoeskoul/batch-request.json"))
WORKSPACE = Path("/workspace")


def emit(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, separators=(",", ":"), ensure_ascii=False) + "\n")
    sys.stdout.flush()


def as_text(value: bytes | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def normalize_cell(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (bytes, bytearray, memoryview)):
        return "base64:" + base64.b64encode(bytes(value)).decode("ascii")
    return str(value)


def render_table(columns: list[str], rows: list[list[Any]]) -> str:
    if not columns:
        return ""
    values = [["" if v is None else str(v) for v in row] for row in rows]
    widths = [len(str(c)) for c in columns]
    for row in values:
        for i, value in enumerate(row[: len(widths)]):
            widths[i] = max(widths[i], len(value))

    def fmt(row: list[str]) -> str:
        return " | ".join(value.ljust(widths[i]) for i, value in enumerate(row))

    header = fmt([str(c) for c in columns])
    sep = "-+-".join("-" * width for width in widths)
    body = "\n".join(fmt(row) for row in values)
    return header + "\n" + sep + (("\n" + body) if body else "")


def split_sql_statements(source: str) -> list[str]:
    parts: list[str] = []
    start = 0
    i = 0
    single = double = backtick = line_comment = block_comment = False
    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ""
        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
                continue
            i += 1
            continue
        if single:
            if ch == "'" and nxt == "'":
                i += 2
                continue
            if ch == "'":
                single = False
            i += 1
            continue
        if double:
            if ch == '"' and nxt == '"':
                i += 2
                continue
            if ch == '"':
                double = False
            i += 1
            continue
        if backtick:
            if ch == "`":
                backtick = False
            i += 1
            continue
        if ch == "-" and nxt == "-":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch == "'":
            single = True
            i += 1
            continue
        if ch == '"':
            double = True
            i += 1
            continue
        if ch == "`":
            backtick = True
            i += 1
            continue
        if ch == ";":
            stmt = source[start:i].strip()
            if stmt:
                parts.append(stmt)
            start = i + 1
        i += 1
    tail = source[start:].strip()
    if tail:
        parts.append(tail)
    return parts


def table_snapshots(conn: sqlite3.Connection, max_rows: int) -> dict[str, Any]:
    out: dict[str, Any] = {}
    names = [row[0] for row in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()]
    for name in names:
        quoted = '"' + str(name).replace('"', '""') + '"'
        cur = conn.execute(f"SELECT * FROM {quoted} LIMIT ?", (max_rows,))
        columns = [{"name": d[0], "type": None} for d in (cur.description or [])]
        rows = [[normalize_cell(v) for v in row] for row in cur.fetchall()]
        count = conn.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
        out[str(name)] = {"name": str(name), "columns": columns, "rows": rows, "rowCount": int(count)}
    return out


def run_sql(request: dict[str, Any]) -> dict[str, Any]:
    dialect = str(request.get("dialect") or "sqlite")
    if dialect != "sqlite":
        return {"kind": "sql", "ok": False, "status": "Error", "dialect": dialect,
                "error": f"Runner batch SQL currently supports sqlite only, not {dialect}.",
                "stderr": f"Unsupported SQL dialect: {dialect}"}

    code = str(request.get("code") or "")
    schema_sql = str(request.get("schemaSql") or "")
    seed_sql = str(request.get("seedSql") or "")
    if not code.strip():
        return {"kind": "sql", "ok": False, "status": "Error", "dialect": dialect,
                "error": "SQL query is empty.", "stderr": "SQL query is empty."}
    if not schema_sql.strip() and not seed_sql.strip():
        return {"kind": "sql", "ok": False, "status": "Error", "dialect": dialect,
                "error": "SQL runtime has no setup configured. Resolve datasetId before calling the runner.",
                "stderr": "SQL runtime setup is missing."}

    limits = request.get("limits") or {}
    timeout_ms = max(250, min(int(limits.get("statementTimeoutMs") or 4000), 60000))
    max_rows = max(1, min(int(limits.get("maxRows") or 200), 10000))
    max_bytes = max(2048, min(int(limits.get("maxBytes") or 128000), 2000000))
    started = time.monotonic()
    deadline = started + timeout_ms / 1000.0
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.set_progress_handler(lambda: 1 if time.monotonic() >= deadline else 0, 1000)

    try:
        if schema_sql.strip():
            conn.executescript(schema_sql)
        if seed_sql.strip():
            conn.executescript(seed_sql)
        before_changes = conn.total_changes
        check_sql = str(request.get("checkSql") or "").strip()
        if check_sql:
            conn.executescript(code)
            cur = conn.execute(check_sql)
        else:
            statements = split_sql_statements(code)
            if not statements:
                raise sqlite3.OperationalError("SQL query is empty.")
            for stmt in statements[:-1]:
                conn.execute(stmt)
            cur = conn.execute(statements[-1])

        columns = [{"name": str(d[0]), "type": None} for d in (cur.description or [])]
        rows: list[list[Any]] = []
        notices: list[str] = []
        if cur.description:
            for row in cur.fetchmany(max_rows + 1):
                if len(rows) >= max_rows:
                    notices.append(f"Showing first {max_rows} rows.")
                    break
                rows.append([normalize_cell(v) for v in row])
        affected = max(0, conn.total_changes - before_changes)
        rendered = render_table([c["name"] for c in columns], rows)
        encoded = rendered.encode("utf-8")
        if len(encoded) > max_bytes:
            rendered = encoded[:max_bytes].decode("utf-8", errors="ignore")
            notices.append(f"Output truncated to {max_bytes} bytes.")
        return {
            "kind": "sql", "ok": True, "status": "Accepted", "dialect": dialect,
            "columns": columns, "rows": rows, "rowCount": len(rows),
            "affectedRows": affected, "notices": notices,
            "stdout": rendered, "stderr": "", "time": f"{time.monotonic() - started:.3f}",
            "tableSnapshots": table_snapshots(conn, max_rows),
        }
    except sqlite3.OperationalError as exc:
        timed_out = "interrupted" in str(exc).lower() or time.monotonic() >= deadline
        message = "SQL execution timed out." if timed_out else str(exc)
        return {"kind": "sql", "ok": False, "status": "Timeout" if timed_out else "Error",
                "dialect": dialect, "error": message, "stderr": message}
    except Exception as exc:
        return {"kind": "sql", "ok": False, "status": "Error", "dialect": dialect,
                "error": str(exc), "stderr": str(exc)}
    finally:
        conn.close()


def run_process(command: list[str], stdin_text: str, timeout_s: float) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        command,
        cwd=WORKSPACE,
        input=stdin_text.encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout_s,
        check=False,
        env={**os.environ, "HOME": "/workspace", "TMPDIR": "/tmp", "PYTHONUNBUFFERED": "1",
             "GIT_PAGER": "cat", "PAGER": "cat", "GIT_TERMINAL_PROMPT": "0"},
    )


def run_code(request: dict[str, Any]) -> dict[str, Any]:
    plan = request.get("plan") or {}
    run_cmd = plan.get("runCmd")
    compile_cmd = plan.get("compileCmd")
    if not isinstance(run_cmd, list) or not run_cmd:
        return {"kind": "code", "ok": False, "status": "Error",
                "error": "Runner execution plan is missing runCmd."}
    timeout_ms = max(250, min(int(request.get("wallTimeoutMs") or 8000), 60000))
    timeout_s = timeout_ms / 1000.0
    stdin_text = str(request.get("stdin") or "")
    compile_output = ""
    try:
        if isinstance(compile_cmd, list) and compile_cmd:
            compiled = run_process([str(x) for x in compile_cmd], "", timeout_s)
            compile_output = as_text(compiled.stdout) + as_text(compiled.stderr)
            if compiled.returncode != 0:
                return {"kind": "code", "ok": False, "status": "Error",
                        "stdout": as_text(compiled.stdout), "stderr": as_text(compiled.stderr),
                        "compile_output": compile_output, "exitCode": int(compiled.returncode),
                        "error": "Compilation failed."}
        ran = run_process([str(x) for x in run_cmd], stdin_text, timeout_s)
        ok = ran.returncode == 0
        result = {"kind": "code", "ok": ok, "status": "Accepted" if ok else "Error",
                  "stdout": as_text(ran.stdout), "stderr": as_text(ran.stderr),
                  "compile_output": compile_output or None, "exitCode": int(ran.returncode)}
        if not ok:
            result["error"] = "Program exited with a non-zero status."
        return result
    except subprocess.TimeoutExpired as exc:
        return {"kind": "code", "ok": False, "status": "Timeout",
                "stdout": as_text(exc.stdout), "stderr": as_text(exc.stderr),
                "compile_output": compile_output or None, "exitCode": None,
                "timedOut": True, "error": "Execution timed out."}
    except Exception as exc:
        return {"kind": "code", "ok": False, "status": "Error", "stdout": "",
                "stderr": str(exc), "compile_output": compile_output or None,
                "exitCode": None, "error": str(exc)}


def main() -> None:
    try:
        request = json.loads(REQUEST_PATH.read_text(encoding="utf-8"))
        if request.get("kind") == "sql":
            emit(run_sql(request))
        elif request.get("kind") == "code":
            emit(run_code(request))
        else:
            emit({"kind": "code", "ok": False, "status": "Error",
                  "error": f"Unsupported batch kind: {request.get('kind')!r}"})
    except Exception as exc:
        emit({"kind": "code", "ok": False, "status": "Error",
              "error": f"Batch runner failed: {exc}"})


if __name__ == "__main__":
    main()
