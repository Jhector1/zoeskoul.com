"""V6B4e2: directory snapshots and non-destructive subtree moves."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest

WORKER = Path(__file__).resolve().parents[1] / "workspace-file-worker.py"
spec = importlib.util.spec_from_file_location("v6e2_file_worker", WORKER)
worker = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(worker)


class DirectorySnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="zoe-v6e2-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.original = worker.ROOT
        worker.ROOT = str(self.root)
        self.addCleanup(lambda: setattr(worker, "ROOT", self.original))
        (self.root / "src" / "folder" / "nested").mkdir(parents=True)
        (self.root / "src" / "folder" / "nested" / "notes.txt").write_bytes(b"original")
        (self.root / "dest").mkdir()

    def req(self, op, path, **kwargs):
        return worker.handle({"op": op, "path": path, "maxBytes": 65536, **kwargs})

    def test_inspect_returns_stable_revision_and_bounded_summary(self):
        a = self.req("inspect", "src/folder")
        b = self.req("inspect", "src/folder")
        self.assertEqual(a, b)
        self.assertEqual(a["kind"], "directory")
        self.assertEqual(a["entryCount"], 2)
        self.assertEqual(a["totalBytes"], len(b"original"))
        self.assertRegex(a["revision"], r"^sha256:[a-f0-9]{64}$")

    def test_edit_renews_revision_and_stale_move_preserves_files(self):
        old = self.req("inspect", "src/folder")["revision"]
        (self.root / "src" / "folder" / "nested" / "notes.txt").write_bytes(b"terminal changed")
        new = self.req("inspect", "src/folder")["revision"]
        self.assertNotEqual(old, new)
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.req("move_directory", "src/folder", destinationPath="dest/folder", expectedRevision=old)
        self.assertEqual((self.root / "src/folder/nested/notes.txt").read_bytes(), b"terminal changed")
        self.assertFalse((self.root / "dest/folder").exists())

    def test_rename_nonempty_directory_is_atomic_and_keeps_contents(self):
        sha = self.req("inspect", "src/folder")["revision"]
        result = self.req("move_directory", "src/folder", destinationPath="dest/folder", expectedRevision=sha)
        self.assertEqual(result["kind"], "directory")
        self.assertEqual(result["revision"], sha)
        self.assertFalse((self.root / "src/folder").exists())
        self.assertEqual((self.root / "dest/folder/nested/notes.txt").read_bytes(), b"original")
        self.assertEqual(self.req("inspect", "dest/folder")["revision"], sha)

    def test_existing_target_never_overwritten(self):
        (self.root / "dest/folder").mkdir()
        (self.root / "dest/folder/terminal.txt").write_bytes(b"keep")
        sha = self.req("inspect", "src/folder")["revision"]
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.req("move_directory", "src/folder", destinationPath="dest/folder", expectedRevision=sha)
        self.assertEqual((self.root / "dest/folder/terminal.txt").read_bytes(), b"keep")
        self.assertTrue((self.root / "src/folder/nested/notes.txt").exists())

    def test_move_directory_fails_without_sha(self):
        for expected in (None,):
            with self.assertRaisesRegex(worker.WorkerError, "PRECONDITION_REQUIRED"):
                self.req("move_directory", "src/folder", destinationPath="dest/folder", expectedRevision=expected)
        with self.assertRaisesRegex(worker.WorkerError, "PRECONDITION_REQUIRED"):
            self.req("move_directory", "src/folder", destinationPath="dest/folder")

    def test_regular_move_does_not_gain_directory_sha_mode(self):
        sha = self.req("inspect", "src/folder")["revision"]
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_REVISION"):
            self.req("move", "src/folder", destinationPath="dest/folder", expectedRevision=sha)
        self.assertTrue((self.root / "src/folder").exists())

    def test_move_directory_rejects_a_regular_file(self):
        (self.root / "src/file.py").write_bytes(b"text")
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_ENTRY"):
            self.req("move_directory", "src/file.py", destinationPath="dest/file.py",
                     expectedRevision=worker.fingerprint(b"text"))

    def test_symlink_inside_subtree_fails_closed(self):
        (self.root / "src/folder/nested/shortcut").symlink_to("notes.txt")
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_ENTRY"):
            self.req("inspect", "src/folder")
        (self.root / "src/folder/nested/shortcut").unlink()
        self.assertEqual((self.root / "src/folder/nested/notes.txt").read_bytes(), b"original")

    def test_unsafe_target_nested_within_source_is_rejected(self):
        sha = self.req("inspect", "src/folder")["revision"]
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.req("move_directory", "src/folder", destinationPath="src/folder/nested/new", expectedRevision=sha)
        self.assertTrue((self.root / "src/folder/nested/notes.txt").exists())

    def test_recursive_deletion_still_refused_even_with_sha(self):
        sha = self.req("inspect", "src/folder")["revision"]
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_REVISION"):
            self.req("rmdir", "src/folder", expectedRevision=sha)
        with self.assertRaisesRegex(worker.WorkerError, "DIRECTORY_NOT_EMPTY"):
            self.req("rmdir", "src/folder", expectedRevision=None)
        self.assertTrue((self.root / "src/folder/nested/notes.txt").exists())

    def test_tree_limits_fail_closed(self):
        original = worker.MAX_TREE_ENTRIES
        worker.MAX_TREE_ENTRIES = 1
        self.addCleanup(lambda: setattr(worker, "MAX_TREE_ENTRIES", original))
        with self.assertRaisesRegex(worker.WorkerError, "TOO_MANY_ENTRIES"):
            self.req("inspect", "src/folder")
        self.assertTrue((self.root / "src/folder/nested/notes.txt").exists())


if __name__ == "__main__":
    unittest.main()
