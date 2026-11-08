#!/usr/bin/env python3
"""V6A: bounded, one-request file operations within the learner's sandbox.

Runs with the SAME unprivileged UID/GID and mount namespace as the learner's
terminal via Docker Exec. No host Docker socket, no network server, no elevated
capabilities. The trusted runner sends one JSON line on stdin; one JSON line is
returned. The worker source lives in the read-only runtime image.

The filesystem can also be written by the learner's terminal. Revision checking
is optimistic and does NOT provide a transaction against arbitrary PTY writers.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import secrets
import signal
import stat
import sys

ROOT = "/workspace"
MAX_REQUEST = 7 * 1024 * 1024
MAX_PAYLOAD = 5 * 1024 * 1024
MAX_RESULT = 256
MAX_DEPTH = 32
BLOCKED_SEGMENTS = frozenset({
    ".git", ".zoeskoul", ".bash_history", "build", "node_modules",
    ".next", "dist", "target", "__pycache__", ".zoe-workspace-internal",
})
O_DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


class WorkerError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def parts_of(value: object, *, allow_root: bool = False) -> list[str]:
    if allow_root and value == "":
        return []
    if not isinstance(value, str) or not value or "\x00" in value or "\\" in value:
        raise WorkerError("INVALID_PATH")
    if value.startswith("/") or len(value.encode("utf-8")) > 1024:
        raise WorkerError("INVALID_PATH")
    parts = value.split("/")
    if len(parts) > MAX_DEPTH or any(not p or p in (".", "..") or p in BLOCKED_SEGMENTS or p.startswith(".zoe-v6-file-") or p.startswith(".zoe-sync-") for p in parts):
        raise WorkerError("INVALID_PATH")
    return parts


def descend(root_fd: int, parts: list[str]) -> int:
    """Resolve every parent relative to a pinned dirfd, without following links."""
    fd = os.dup(root_fd)
    try:
        for name in parts:
            next_fd = os.open(name, O_DIR, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except Exception:
        os.close(fd)
        raise


def fingerprint(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def current_file(parent_fd: int, name: str, max_bytes: int):
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent_fd)
    except FileNotFoundError:
        return None
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise WorkerError("INVALID_ENTRY")
        if st.st_size > max_bytes:
            raise WorkerError("TOO_LARGE")
        with os.fdopen(fd, "rb", closefd=False) as reader:
            data = reader.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise WorkerError("TOO_LARGE")
        return data, stat.S_IMODE(st.st_mode)
    finally:
        os.close(fd)


def parse_expected(request: dict) -> str | None:
    if "expectedRevision" not in request:
        raise WorkerError("PRECONDITION_REQUIRED")
    expected = request["expectedRevision"]
    if expected is None:
        return None
    if not isinstance(expected, str) or len(expected) != 71 or not expected.startswith("sha256:"):
        raise WorkerError("INVALID_REVISION")
    if any(c not in "0123456789abcdef" for c in expected[7:]):
        raise WorkerError("INVALID_REVISION")
    return expected


def check_expected(current, expected) -> None:
    rev = fingerprint(current[0]) if current is not None else None
    if rev != expected:
        raise WorkerError("CONFLICT")


def validated_payload(request: dict, max_bytes: int) -> bytes:
    text = request.get("data")
    if not isinstance(text, str) or len(text) > (max_bytes * 4 // 3) + 8:
        raise WorkerError("TOO_LARGE")
    try:
        data = base64.b64decode(text, validate=True)
    except (ValueError, binascii.Error):
        raise WorkerError("INVALID_DATA") from None
    if len(data) > max_bytes or base64.b64encode(data).decode("ascii") != text:
        raise WorkerError("INVALID_DATA")
    return data


def handle(req: object) -> dict:
    if not isinstance(req, dict):
        raise WorkerError("INVALID_REQUEST")
    op = req.get("op")
    if op not in ("read", "write", "delete", "list", "mkdir"):
        raise WorkerError("INVALID_OPERATION")
    parts = parts_of(req.get("path"), allow_root=op == "list")
    limit = req.get("maxBytes")
    if type(limit) is not int or not 0 < limit <= MAX_PAYLOAD:
        raise WorkerError("INVALID_LIMIT")

    root_fd = os.open(ROOT, O_DIR)
    try:
        if op == "list":
            folder_fd = descend(root_fd, parts)
            try:
                entries = []
                for entry in os.scandir(folder_fd):
                    if entry.name in BLOCKED_SEGMENTS or entry.name.startswith((".zoe-sync-", ".zoe-v6-file-")):
                        continue
                    st = entry.stat(follow_symlinks=False)
                    if stat.S_ISDIR(st.st_mode):
                        kind = "directory"
                    elif stat.S_ISREG(st.st_mode):
                        kind = "file"
                    else:
                        continue
                    entries.append({"name": entry.name, "kind": kind, "size": st.st_size})
                    if len(entries) > MAX_RESULT:
                        raise WorkerError("TOO_MANY_ENTRIES")
                return {"ok": True, "entries": sorted(entries, key=lambda e: e["name"])}
            finally:
                os.close(folder_fd)

        parent_fd = descend(root_fd, parts[:-1])
        try:
            name = parts[-1]
            if op == "mkdir":
                try:
                    os.mkdir(name, mode=0o755, dir_fd=parent_fd)
                except FileExistsError:
                    raise WorkerError("CONFLICT") from None
                os.fsync(parent_fd)
                return {"ok": True, "created": True}

            current = current_file(parent_fd, name, limit)
            if op == "read":
                if current is None:
                    raise WorkerError("NOT_FOUND")
                data, mode = current
                return {"ok": True, "revision": fingerprint(data), "mode": mode,
                        "data": base64.b64encode(data).decode("ascii")}

            expected = parse_expected(req)
            check_expected(current, expected)

            if op == "delete":
                if current is None:
                    raise WorkerError("NOT_FOUND")
                os.unlink(name, dir_fd=parent_fd)
                os.fsync(parent_fd)
                return {"ok": True, "deleted": True}

            data = validated_payload(req, limit)
            if current is not None:
                old, mode = current
                if not (mode & 0o200):
                    raise WorkerError("READ_ONLY")
                if old == data:
                    return {"ok": True, "revision": fingerprint(data), "mode": mode, "unchanged": True}
            else:
                mode = 0o644

            # Open the temporary file relative to a pinned directory. The PTY
            # cannot redirect operations through a swapped parent symlink.
            tmp = ".zoe-v6-file-" + secrets.token_hex(16)
            temp_fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                              0o600, dir_fd=parent_fd)
            try:
                try:
                    with os.fdopen(temp_fd, "wb", closefd=False) as stream:
                        stream.write(data)
                        stream.flush()
                    os.fchmod(temp_fd, mode & 0o777)
                    os.fsync(temp_fd)
                finally:
                    os.close(temp_fd)
                # Recheck after staging, but the arbitrary terminal can still
                # write between this check and os.replace. The conflict model
                # is therefore optimistic, never called race-free/transactional.
                check_expected(current_file(parent_fd, name, limit), expected)
                os.replace(tmp, name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
                os.fsync(parent_fd)
            finally:
                try:
                    os.unlink(tmp, dir_fd=parent_fd)
                except FileNotFoundError:
                    pass
            return {"ok": True, "revision": fingerprint(data), "mode": mode, "unchanged": False}
        finally:
            os.close(parent_fd)
    finally:
        os.close(root_fd)


def main() -> None:
    if hasattr(signal, "SIGALRM"):
        signal.signal(signal.SIGALRM, lambda _signum, _frame: (_ for _ in ()).throw(WorkerError("TIMEOUT")))
        signal.alarm(10)
    try:
        # Single bounded JSON line. Never accept a stream of commands or shell.
        raw = sys.stdin.buffer.readline(MAX_REQUEST + 2)
        if len(raw) > MAX_REQUEST or not raw.endswith(b"\n"):
            raise WorkerError("INVALID_REQUEST")
        result = handle(json.loads(raw))
    except WorkerError as e:
        result = {"ok": False, "code": e.code}
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError, TypeError):
        result = {"ok": False, "code": "FILESYSTEM_ERROR"}
    print(json.dumps(result, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
