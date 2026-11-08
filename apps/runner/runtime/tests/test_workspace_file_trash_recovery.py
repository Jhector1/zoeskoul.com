"""V6B4e3: non-destructive directory trash and in-session recovery."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest

WORKER = Path(__file__).resolve().parents[1] / "workspace-file-worker.py"
spec = importlib.util.spec_from_file_location("v6e3_file_worker", WORKER)
worker = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(worker)


class RecoverableDirectoryTrashTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="zoe-v6e3-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.original_root = worker.ROOT
        worker.ROOT = str(self.root)
        self.addCleanup(lambda: setattr(worker, "ROOT", self.original_root))
        (self.root / "src" / "nested" / "code").mkdir(parents=True)
        (self.root / "src" / "nested" / "code" / "hello.py").write_bytes(b"print('hello')\n")

    def request(self, op, path, **extra):
        return worker.handle({"op": op, "path": path, "maxBytes": 65536, **extra})

    def revision(self):
        return self.request("inspect", "src/nested")["revision"]

    def test_empty_trash_list_has_no_side_effects(self):
        self.assertEqual(self.request("list_trash", ""), {"ok": True, "entries": []})
        self.assertFalse((self.root / worker.TRASH_FOLDER).exists())

    def test_trash_and_restore_preserve_every_file_and_nested_directory(self):
        rev = self.revision()
        result = self.request("trash_directory", "src/nested", expectedRevision=rev)
        self.assertTrue(result["trashed"])
        self.assertEqual(result["kind"], "directory")
        self.assertFalse((self.root / "src" / "nested").exists())
        entries = self.request("list_trash", "")["entries"]
        self.assertEqual(entries, [{"originalPath": "src/nested", "trashId": result["trashId"]}])
        restored = self.request("restore_directory", "src/nested", trashId=result["trashId"], expectedRevision=None)
        self.assertTrue(restored["restored"])
        self.assertEqual(restored["revision"], rev)
        self.assertEqual((self.root / "src/nested/code/hello.py").read_bytes(), b"print('hello')\n")
        self.assertEqual(self.request("list_trash", "")["entries"], [])

    def test_stale_revision_preserves_data_and_does_not_create_trash(self):
        rev = self.revision()
        (self.root / "src/nested/code/hello.py").write_bytes(b"terminal edit")
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.request("trash_directory", "src/nested", expectedRevision=rev)
        self.assertEqual((self.root / "src/nested/code/hello.py").read_bytes(), b"terminal edit")
        self.assertEqual(self.request("list_trash", "")["entries"], [])

    def test_restore_never_overwrites_a_terminal_created_replacement(self):
        token = self.request("trash_directory", "src/nested", expectedRevision=self.revision())["trashId"]
        (self.root / "src/nested").mkdir()
        (self.root / "src/nested" / "new.txt").write_bytes(b"new terminal work")
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.request("restore_directory", "src/nested", trashId=token, expectedRevision=None)
        self.assertEqual((self.root / "src/nested/new.txt").read_bytes(), b"new terminal work")
        self.assertEqual(len(self.request("list_trash", "")["entries"]), 1)
        self.assertTrue((self.root / worker.TRASH_FOLDER / ("d-" + token) / "code/hello.py").is_file())

    def test_restore_refuses_mismatched_original_path(self):
        token = self.request("trash_directory", "src/nested", expectedRevision=self.revision())["trashId"]
        with self.assertRaisesRegex(worker.WorkerError, "CONFLICT"):
            self.request("restore_directory", "src/wrong", trashId=token, expectedRevision=None)
        self.assertEqual(self.request("list_trash", "")["entries"][0]["originalPath"], "src/nested")

    def test_restore_preserves_terminal_modifications_made_inside_trash(self):
        token = self.request("trash_directory", "src/nested", expectedRevision=self.revision())["trashId"]
        (self.root / worker.TRASH_FOLDER / ("d-" + token) / "code/hello.py").write_bytes(b"modified after trash")
        self.request("restore_directory", "src/nested", trashId=token, expectedRevision=None)
        self.assertEqual((self.root / "src/nested/code/hello.py").read_bytes(), b"modified after trash")

    def test_symlinks_inside_source_are_rejected_without_moving(self):
        (self.root / "src/nested/code/link").symlink_to("hello.py")
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_ENTRY"):
            self.request("inspect", "src/nested")
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_ENTRY"):
            self.request("trash_directory", "src/nested", expectedRevision=worker.fingerprint(b"foo"))
        self.assertTrue((self.root / "src/nested/code/hello.py").is_file())
        self.assertFalse((self.root / worker.TRASH_FOLDER).exists())

    def test_trash_internal_path_cannot_be_accessed_by_file_ops(self):
        token = self.request("trash_directory", "src/nested", expectedRevision=self.revision())["trashId"]
        for op in ("inspect", "list", "read"):
            with self.subTest(op=op), self.assertRaisesRegex(worker.WorkerError, "INVALID_PATH"):
                self.request(op, worker.TRASH_FOLDER + "/d-" + token)

    def test_invalid_or_unknown_recovery_tokens_fail_closed(self):
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_REQUEST"):
            self.request("restore_directory", "src/nested", trashId="../wrong", expectedRevision=None)
        with self.assertRaisesRegex(worker.WorkerError, "NOT_FOUND"):
            self.request("restore_directory", "src/nested", trashId="0" * 32, expectedRevision=None)

    def test_restore_requires_explicit_null_precondition(self):
        token = self.request("trash_directory", "src/nested", expectedRevision=self.revision())["trashId"]
        with self.assertRaisesRegex(worker.WorkerError, "PRECONDITION_REQUIRED"):
            self.request("restore_directory", "src/nested", trashId=token)
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_REVISION"):
            self.request("restore_directory", "src/nested", trashId=token, expectedRevision=self.revision() if (self.root / "src/nested").exists() else worker.fingerprint(b"x"))

    def test_bounded_trash_refuses_the_seventeenth_directory(self):
        first = self.request("trash_directory", "src/nested", expectedRevision=self.revision())
        self.assertTrue(first["trashed"])
        for i in range(1, worker.MAX_TRASH_FOLDERS):
            path = self.root / "src" / ("folder" + str(i))
            path.mkdir()
            path.joinpath("a.py").write_bytes(b"hello")
            rev = self.request("inspect", "src/" + path.name)["revision"]
            self.request("trash_directory", "src/" + path.name, expectedRevision=rev)
        extra = self.root / "src/extra"
        extra.mkdir()
        extra.joinpath("a.py").write_bytes(b"keep")
        with self.assertRaisesRegex(worker.WorkerError, "TOO_MANY_ENTRIES"):
            self.request("trash_directory", "src/extra", expectedRevision=self.request("inspect", "src/extra")["revision"])
        self.assertEqual(extra.joinpath("a.py").read_bytes(), b"keep")
        self.assertEqual(len(self.request("list_trash", "")["entries"]), worker.MAX_TRASH_FOLDERS)

    def test_invalid_list_trash_path_rejected(self):
        with self.assertRaisesRegex(worker.WorkerError, "INVALID_PATH"):
            self.request("list_trash", "src")


if __name__ == "__main__":
    unittest.main()
