"""Pure local contract tests for the immutable V6A file worker (no Docker)."""
from __future__ import annotations

import base64
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

WORKER = Path(__file__).resolve().parents[1] / "workspace-file-worker.py"
spec = importlib.util.spec_from_file_location("workspace_file_worker", WORKER)
worker = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(worker)


def b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


class WorkspaceFileWorkerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="zoe-v6a-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.original_root = worker.ROOT
        worker.ROOT = str(self.root)
        self.addCleanup(lambda: setattr(worker, "ROOT", self.original_root))
        (self.root / "src").mkdir()

    def request(self, op: str, path: str, **kwargs):
        return worker.handle({"op": op, "path": path, "maxBytes": 65536, **kwargs})

    def test_create_read_and_revision(self):
        result = self.request("write", "src/main.c", expectedRevision=None, data=b64(b"hello\n"))
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], 0o644)
        fetched = self.request("read", "src/main.c")
        self.assertEqual(fetched["revision"], result["revision"])
        self.assertEqual(base64.b64decode(fetched["data"]), b"hello\n")

    def test_same_content_is_noop_and_mode_preserved(self):
        p = self.root / "src" / "test.sh"
        p.write_bytes(b"echo hi\n")
        p.chmod(0o755)
        revision = worker.fingerprint(p.read_bytes())
        result = self.request("write", "src/test.sh", expectedRevision=revision, data=b64(p.read_bytes()))
        self.assertTrue(result["unchanged"])
        self.assertEqual(p.stat().st_mode & 0o777, 0o755)

    def test_changed_executable_preserves_mode(self):
        p = self.root / "src" / "test.sh"
        p.write_bytes(b"echo hi\n")
        p.chmod(0o755)
        self.request("write", "src/test.sh", expectedRevision=worker.fingerprint(p.read_bytes()), data=b64(b"echo bye\n"))
        self.assertEqual(p.read_bytes(), b"echo bye\n")
        self.assertEqual(p.stat().st_mode & 0o777, 0o755)

    def test_stale_write_rejected_without_modification(self):
        p = self.root / "src" / "main.c"
        p.write_bytes(b"terminal changed")
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.request("write", "src/main.c", expectedRevision=worker.fingerprint(b"old"), data=b64(b"browser"))
        self.assertEqual(p.read_bytes(), b"terminal changed")

    def test_creation_requires_absence(self):
        (self.root / "src" / "main.c").write_bytes(b"existing")
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.request("write", "src/main.c", expectedRevision=None, data=b64(b"replacement"))

    def test_write_requires_baseline(self):
        with self.assertRaisesRegex(worker.WorkerError, "PRECONDITION_REQUIRED"):
            self.request("write", "src/main.c", data=b64(b"missing baseline"))

    def test_symlink_parent_never_follows(self):
        outside = self.root.parent / (self.root.name + "-outside")
        outside.mkdir()
        self.addCleanup(lambda: outside.rmdir())
        (self.root / "link").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(OSError):
            self.request("write", "link/escape.txt", expectedRevision=None, data=b64(b"bad"))
        self.assertFalse((outside / "escape.txt").exists())

    def test_symlink_final_rejected(self):
        (self.root / "src" / "link.c").symlink_to("main.c")
        with self.assertRaises(OSError):
            self.request("read", "src/link.c")

    def test_parent_segments_rejected(self):
        for p in ("../outside", "src/../../outside", "/etc/passwd", "src//main.c", "src/./x", "src\\x", ".git/config", "src/node_modules/x"):
            with self.subTest(path=p), self.assertRaisesRegex(worker.WorkerError, "INVALID_PATH"):
                self.request("read", p)

    def test_delete_uses_revision(self):
        p = self.root / "src" / "trash.txt"
        p.write_bytes(b"text")
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.request("delete", "src/trash.txt", expectedRevision=worker.fingerprint(b"older"))
        self.assertTrue(p.exists())
        result = self.request("delete", "src/trash.txt", expectedRevision=worker.fingerprint(b"text"))
        self.assertTrue(result["deleted"])
        self.assertFalse(p.exists())

    def test_mkdir_without_overwrite(self):
        self.assertTrue(self.request("mkdir", "src/new")["created"])
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.request("mkdir", "src/new")

    def test_list_is_bounded_and_hides_internal(self):
        (self.root / "src" / "hello.c").write_bytes(b"a")
        (self.root / "src" / ".bash_history").write_bytes(b"b")
        listing = self.request("list", "src")
        self.assertEqual([e["name"] for e in listing["entries"]], ["hello.c"])

    def test_binary_is_byte_exact(self):
        blob = b"\x00\xff\x01\xfe\n"
        self.request("write", "src/image.png", expectedRevision=None, data=b64(blob))
        self.assertEqual(base64.b64decode(self.request("read", "src/image.png")["data"]), blob)

    def test_cannot_modify_readonly_file(self):
        p = self.root / "src" / "readonly.c"
        p.write_bytes(b"old")
        p.chmod(0o444)
        with self.assertRaisesRegex(worker.WorkerError, "READ_ONLY"):
            self.request("write", "src/readonly.c", expectedRevision=worker.fingerprint(b"old"), data=b64(b"new"))
        self.assertEqual(p.read_bytes(), b"old")

    def test_invalid_base64_is_rejected(self):
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_DATA"):
            self.request("write", "src/x.c", expectedRevision=None, data="\\not-base64!")

    def test_missing_parent_is_not_created(self):
        with self.assertRaises(FileNotFoundError):
            self.request("write", "missing/x.c", expectedRevision=None, data=b64(b"x"))


if __name__ == "__main__":
    unittest.main()
