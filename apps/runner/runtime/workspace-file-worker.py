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
import ctypes
import errno
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
# Directory manifest is bounded independently of a single-file write.
MAX_TREE_ENTRIES = 256
MAX_TRASH_FOLDERS = 16
TRASH_FOLDER = ".zoe-v6-trash"
MAX_TREE_BYTES = 8 * 1024 * 1024 + 256 * 1024
BLOCKED_SEGMENTS = frozenset({
    ".git", ".zoeskoul", ".bash_history", "build", "node_modules",
    ".next", "dist", "target", "__pycache__", ".zoe-workspace-internal", TRASH_FOLDER,
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



def rename_noreplace(source_parent: int, source: str, target_parent: int, target: str) -> None:
    """Atomic exclusive rename on Linux and macOS; never fall back to os.rename.

    Linux uses renameat2(RENAME_NOREPLACE=1). macOS uses
    renameatx_np(RENAME_EXCL=0x4). Both take pinned directory descriptors;
    if the platform or filesystem cannot guarantee exclusivity, fail closed.
    """
    if sys.platform == "linux":
        function_name, exclusive_flag = "renameat2", 1
    elif sys.platform == "darwin":
        function_name, exclusive_flag = "renameatx_np", 0x00000004
    else:
        raise WorkerError("UNSUPPORTED_OPERATION")

    libc = ctypes.CDLL(None, use_errno=True)
    exclusive_rename = getattr(libc, function_name, None)
    if exclusive_rename is None:
        raise WorkerError("UNSUPPORTED_OPERATION")
    exclusive_rename.argtypes = [ctypes.c_int, ctypes.c_char_p,
                                 ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    exclusive_rename.restype = ctypes.c_int
    outcome = exclusive_rename(source_parent, os.fsencode(source),
                               target_parent, os.fsencode(target), exclusive_flag)
    if outcome != 0:
        code = ctypes.get_errno()
        if code in (errno.EEXIST, errno.ENOTEMPTY):
            raise WorkerError("CONFLICT")
        if code in (errno.ENOSYS, errno.ENOTSUP, errno.EOPNOTSUPP):
            raise WorkerError("UNSUPPORTED_OPERATION")
        raise OSError(code, os.strerror(code))


def directory_revision(directory_fd: int) -> tuple[str, int, int]:
    """Bounded, stable-order subtree digest without traversing symlinks.

    This is an optimistic snapshot, not a lock on terminal-originated writes.
    It can be used as a CAS precondition for an atomic *move*, which does not
    destroy content. It MUST NOT authorize recursive deletion.
    """
    digest = hashlib.sha256(b"zoe-v6-directory-revision-v1\0")
    count = 0
    total_bytes = 0

    def visit(fd: int, prefix: bytes, depth: int) -> None:
        nonlocal count, total_bytes
        if depth > MAX_DEPTH:
            raise WorkerError("TOO_MANY_ENTRIES")
        names: list[str] = []
        with os.scandir(fd) as entries:
            for item in entries:
                names.append(item.name)
                if len(names) > MAX_TREE_ENTRIES:
                    raise WorkerError("TOO_MANY_ENTRIES")
        for name in sorted(names, key=os.fsencode):
            # Fail closed on internal files: never move a managed subtree
            # without the platform's explicit policy consenting to it.
            if (name in (".", "..") or name in BLOCKED_SEGMENTS or
                    name.startswith((".zoe-v6-file-", ".zoe-sync-"))):
                raise WorkerError("INVALID_ENTRY")
            count += 1
            if count > MAX_TREE_ENTRIES:
                raise WorkerError("TOO_MANY_ENTRIES")
            relative = prefix + os.fsencode(name)
            if len(relative) > 1024 or len(relative.split(b"/")) > MAX_DEPTH:
                raise WorkerError("INVALID_ENTRY")
            entry_st = os.stat(name, dir_fd=fd, follow_symlinks=False)
            if stat.S_ISDIR(entry_st.st_mode):
                child_fd = os.open(name, O_DIR, dir_fd=fd)
                try:
                    opened = os.fstat(child_fd)
                    if (opened.st_dev, opened.st_ino) != (entry_st.st_dev, entry_st.st_ino):
                        raise WorkerError("CONFLICT")
                    digest.update(b"D\0" + relative + b"\0" +
                                  str(stat.S_IMODE(opened.st_mode)).encode() + b"\n")
                    visit(child_fd, relative + b"/", depth + 1)
                    after = os.fstat(child_fd)
                    if (after.st_ino, after.st_mtime_ns, after.st_ctime_ns) != (
                            opened.st_ino, opened.st_mtime_ns, opened.st_ctime_ns):
                        raise WorkerError("CONFLICT")
                finally:
                    os.close(child_fd)
            elif stat.S_ISREG(entry_st.st_mode):
                file_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC,
                                  dir_fd=fd)
                try:
                    opened = os.fstat(file_fd)
                    if (opened.st_dev, opened.st_ino) != (entry_st.st_dev, entry_st.st_ino):
                        raise WorkerError("CONFLICT")
                    if opened.st_size > MAX_PAYLOAD or total_bytes + opened.st_size > MAX_TREE_BYTES:
                        raise WorkerError("TOO_LARGE")
                    body_hash = hashlib.sha256()
                    size = 0
                    while True:
                        chunk = os.read(file_fd, 65536)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > MAX_PAYLOAD or total_bytes + size > MAX_TREE_BYTES:
                            raise WorkerError("TOO_LARGE")
                        body_hash.update(chunk)
                    after = os.fstat(file_fd)
                    if (opened.st_ino, opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns) != (
                            after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                        raise WorkerError("CONFLICT")
                    total_bytes += size
                    digest.update(b"F\0" + relative + b"\0" +
                                  str(stat.S_IMODE(opened.st_mode)).encode() + b"\0" +
                                  str(size).encode() + b"\0" + body_hash.digest())
                finally:
                    os.close(file_fd)
            else:
                # No symlinks, sockets, devices, or ambiguous filesystem nodes.
                raise WorkerError("INVALID_ENTRY")

    start_st = os.fstat(directory_fd)
    visit(directory_fd, b"", 0)
    end_st = os.fstat(directory_fd)
    if (start_st.st_ino, start_st.st_mtime_ns, start_st.st_ctime_ns) != (
            end_st.st_ino, end_st.st_mtime_ns, end_st.st_ctime_ns):
        raise WorkerError("CONFLICT")
    return "sha256:" + digest.hexdigest(), count, total_bytes


def checked_directory(parent_fd: int, name: str, expected: str | None):
    fd = os.open(name, O_DIR, dir_fd=parent_fd)
    try:
        revision, entries, total = directory_revision(fd)
        if expected is None:
            if entries:
                raise WorkerError("DIRECTORY_NOT_EMPTY")
        elif revision != expected:
            raise WorkerError("CONFLICT")
        return revision, entries, total
    finally:
        os.close(fd)


def check_empty_directory(parent_fd: int, name: str) -> None:
    fd = os.open(name, O_DIR, dir_fd=parent_fd)
    try:
        with os.scandir(fd) as entries:
            if next(entries, None) is not None:
                raise WorkerError("DIRECTORY_NOT_EMPTY")
    finally:
        os.close(fd)


def move_entry(root_fd: int, req: dict, src: list[str], limit: int, *, directory_only: bool = False) -> dict:
    dest = parts_of(req.get("destinationPath"))
    if src == dest:
        raise WorkerError("CONFLICT")
    expected = parse_expected(req)
    from_parent = descend(root_fd, src[:-1])
    try:
        to_parent = descend(root_fd, dest[:-1])
        try:
            source_name, target_name = src[-1], dest[-1]
            st = os.stat(source_name, dir_fd=from_parent, follow_symlinks=False)
            if stat.S_ISREG(st.st_mode):
                if directory_only:
                    raise WorkerError("INVALID_ENTRY")
                if expected is None:
                    raise WorkerError("PRECONDITION_REQUIRED")
                current = current_file(from_parent, source_name, limit)
                check_expected(current, expected)
                kind = "file"
            elif stat.S_ISDIR(st.st_mode):
                if directory_only and expected is None:
                    raise WorkerError("PRECONDITION_REQUIRED")
                if not directory_only and expected is not None:
                    raise WorkerError("INVALID_REVISION")
                checked_directory(from_parent, source_name, expected)
                kind = "directory"
            else:
                raise WorkerError("INVALID_ENTRY")
            # Recheck before the atomic rename. PTY writes can still race,
            # therefore the contract is optimistic, never transaction-free.
            if kind == "file":
                check_expected(current_file(from_parent, source_name, limit), expected)
            else:
                checked_directory(from_parent, source_name, expected)
            # Moving a folder below itself must never be attempted.
            if dest[:len(src)] == src:
                raise WorkerError("CONFLICT")
            rename_noreplace(from_parent, source_name, to_parent, target_name)
            os.fsync(from_parent)
            if from_parent != to_parent:
                os.fsync(to_parent)
            return {"ok": True, "moved": True, "kind": kind,
                    **({"revision": expected} if expected is not None else {})}
        finally:
            os.close(to_parent)
    finally:
        os.close(from_parent)


def remove_empty_directory(parent_fd: int, name: str) -> dict:
    check_empty_directory(parent_fd, name)
    try:
        os.rmdir(name, dir_fd=parent_fd)
    except OSError as exc:
        if exc.errno in (errno.ENOTEMPTY, errno.EEXIST):
            raise WorkerError("DIRECTORY_NOT_EMPTY") from None
        raise
    os.fsync(parent_fd)
    return {"ok": True, "deleted": True, "kind": "directory"}


def open_trash_directory(root_fd: int, *, create: bool) -> int | None:
    """The recoverable directory is kept inside this session's own workspace.

    No host filesystem access, symlink traversal, or cross-session storage.
    The directory survives until workspace/session reclamation, not forever.
    """
    try:
        if create:
            try:
                os.mkdir(TRASH_FOLDER, mode=0o700, dir_fd=root_fd)
                os.fsync(root_fd)
            except FileExistsError:
                pass
        fd = os.open(TRASH_FOLDER, O_DIR, dir_fd=root_fd)
    except FileNotFoundError:
        return None
    st = os.fstat(fd)
    if not stat.S_ISDIR(st.st_mode):
        os.close(fd)
        raise WorkerError("INVALID_ENTRY")
    return fd


def trash_token(value: object) -> str:
    if not isinstance(value, str) or len(value) != 32 or any(c not in "0123456789abcdef" for c in value):
        raise WorkerError("INVALID_REQUEST")
    return value


def load_trash_metadata(fd: int, token: str) -> str:
    meta_name = "m-" + token
    handle = os.open(meta_name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
    try:
        entry = os.fstat(handle)
        if not stat.S_ISREG(entry.st_mode) or entry.st_size > 2048:
            raise WorkerError("INVALID_ENTRY")
        with os.fdopen(handle, "rb", closefd=False) as stream:
            raw = stream.read(2049)
        if len(raw) > 2048:
            raise WorkerError("INVALID_ENTRY")
        metadata = json.loads(raw)
        if not isinstance(metadata, dict) or not isinstance(metadata.get("originalPath"), str):
            raise WorkerError("INVALID_ENTRY")
        original = metadata["originalPath"]
        parts_of(original)
        return original
    except (ValueError, UnicodeError, TypeError, json.JSONDecodeError):
        raise WorkerError("INVALID_ENTRY") from None
    finally:
        os.close(handle)


def trash_directory(root_fd: int, req: dict, parts: list[str]) -> dict:
    expected = parse_expected(req)
    if expected is None:
        raise WorkerError("PRECONDITION_REQUIRED")
    parent_fd = descend(root_fd, parts[:-1])
    try:
        name = parts[-1]
        checked_directory(parent_fd, name, expected)
        trash_fd = open_trash_directory(root_fd, create=True)
        assert trash_fd is not None
        try:
            # Prevent unbounded trash accumulation in the active shell.
            with os.scandir(trash_fd) as iterator:
                count = sum(1 for entry in iterator if entry.name.startswith("d-"))
            if count >= MAX_TRASH_FOLDERS:
                raise WorkerError("TOO_MANY_ENTRIES")
            token = secrets.token_hex(16)
            metadata_name = "m-" + token
            dir_name = "d-" + token
            metadata = json.dumps({"originalPath": "/".join(parts)}, separators=(",", ":")).encode()
            if len(metadata) > 2048:
                raise WorkerError("INVALID_PATH")
            meta_fd = os.open(metadata_name,
                              os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                              0o600, dir_fd=trash_fd)
            try:
                os.write(meta_fd, metadata)
                os.fsync(meta_fd)
            finally:
                os.close(meta_fd)
            os.fsync(trash_fd)
            moved = False
            try:
                # The terminal can mutate between digest and rename. Never
                # recursively destroy the moved tree: preserve every byte.
                checked_directory(parent_fd, name, expected)
                rename_noreplace(parent_fd, name, trash_fd, dir_name)
                moved = True
                os.fsync(parent_fd)
                os.fsync(trash_fd)
            finally:
                if not moved:
                    os.unlink(metadata_name, dir_fd=trash_fd)
                    os.fsync(trash_fd)
            return {"ok": True, "trashed": True, "kind": "directory", "trashId": token}
        finally:
            os.close(trash_fd)
    finally:
        os.close(parent_fd)


def list_trash(root_fd: int) -> dict:
    trash_fd = open_trash_directory(root_fd, create=False)
    if trash_fd is None:
        return {"ok": True, "entries": []}
    try:
        names = []
        with os.scandir(trash_fd) as iterator:
            for entry in iterator:
                if entry.name.startswith("d-"):
                    names.append(entry.name)
                    if len(names) > MAX_TRASH_FOLDERS:
                        raise WorkerError("TOO_MANY_ENTRIES")
        result = []
        for name in sorted(names):
            token = trash_token(name[2:])
            st = os.stat(name, dir_fd=trash_fd, follow_symlinks=False)
            if not stat.S_ISDIR(st.st_mode):
                raise WorkerError("INVALID_ENTRY")
            original = load_trash_metadata(trash_fd, token)
            result.append({"trashId": token, "originalPath": original})
        return {"ok": True, "entries": result}
    finally:
        os.close(trash_fd)


def restore_directory(root_fd: int, req: dict, parts: list[str]) -> dict:
    # A restore requires the original destination to be absent. Never overwrite.
    if parse_expected(req) is not None:
        raise WorkerError("INVALID_REVISION")
    token = trash_token(req.get("trashId"))
    trash_fd = open_trash_directory(root_fd, create=False)
    if trash_fd is None:
        raise WorkerError("NOT_FOUND")
    try:
        try:
            original = load_trash_metadata(trash_fd, token)
        except FileNotFoundError:
            raise WorkerError("NOT_FOUND") from None
        if original != "/".join(parts):
            raise WorkerError("CONFLICT")
        source_name = "d-" + token
        # Refuse a symbolic-link-replaced or otherwise invalid trash item.
        source_fd = os.open(source_name, O_DIR, dir_fd=trash_fd)
        try:
            revision, _entries, _total = directory_revision(source_fd)
        finally:
            os.close(source_fd)
        target_parent = descend(root_fd, parts[:-1])
        try:
            rename_noreplace(trash_fd, source_name, target_parent, parts[-1])
            os.fsync(target_parent)
            os.fsync(trash_fd)
        finally:
            os.close(target_parent)
        # Metadata can remain only if interrupted; list_trash skips no entries
        # without a matching directory, so this failure is recoverable.
        os.unlink("m-" + token, dir_fd=trash_fd)
        os.fsync(trash_fd)
        return {"ok": True, "restored": True, "kind": "directory", "revision": revision}
    finally:
        os.close(trash_fd)


def handle(req: object) -> dict:
    if not isinstance(req, dict):
        raise WorkerError("INVALID_REQUEST")
    op = req.get("op")
    if op not in ("read", "write", "delete", "list", "mkdir", "move", "rmdir", "inspect", "move_directory", "trash_directory", "list_trash", "restore_directory"):
        raise WorkerError("INVALID_OPERATION")
    parts = parts_of(req.get("path"), allow_root=op in ("list", "list_trash"))
    limit = req.get("maxBytes")
    if type(limit) is not int or not 0 < limit <= MAX_PAYLOAD:
        raise WorkerError("INVALID_LIMIT")

    if op == "list_trash" and parts:
        raise WorkerError("INVALID_PATH")

    root_fd = os.open(ROOT, O_DIR)
    try:
        if op == "list_trash":
            return list_trash(root_fd)

        if op == "trash_directory":
            return trash_directory(root_fd, req, parts)

        if op == "restore_directory":
            return restore_directory(root_fd, req, parts)

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

        if op == "inspect":
            parent_fd = descend(root_fd, parts[:-1])
            try:
                fd = os.open(parts[-1], O_DIR, dir_fd=parent_fd)
                try:
                    revision, entries, total = directory_revision(fd)
                    return {"ok": True, "kind": "directory", "revision": revision,
                            "entryCount": entries, "totalBytes": total}
                finally:
                    os.close(fd)
            finally:
                os.close(parent_fd)

        if op in ("move", "move_directory"):
            return move_entry(root_fd, req, parts, limit, directory_only=op == "move_directory")

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

            if op == "rmdir":
                if parse_expected(req) is not None:
                    raise WorkerError("INVALID_REVISION")
                return remove_empty_directory(parent_fd, name)

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
