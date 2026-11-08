"""Guarded platform dispatch tests for atomic exclusive workspace file moves."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest
from unittest import mock
import errno

WORKER = Path(__file__).resolve().parents[1] / 'workspace-file-worker.py'
spec = importlib.util.spec_from_file_location('workspace_file_worker_rename', WORKER)
assert spec and spec.loader
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class FakeFunction:
    def __init__(self, result=0):
        self.result = result
        self.calls = []
        self.argtypes = None
        self.restype = None

    def __call__(self, *args):
        self.calls.append(args)
        return self.result


class WorkspaceExclusiveRenamePlatformTest(unittest.TestCase):
    def test_linux_uses_renameat2_noreplace(self):
        method = FakeFunction()
        library = type('Library', (), {'renameat2': method})()
        with mock.patch.object(worker.sys, 'platform', 'linux'), \
             mock.patch.object(worker.ctypes, 'CDLL', return_value=library):
            worker.rename_noreplace(11, 'a', 12, 'b')
        self.assertEqual(method.calls, [(11, b'a', 12, b'b', 1)])

    def test_macos_uses_renameatx_np_excl(self):
        method = FakeFunction()
        library = type('Library', (), {'renameatx_np': method})()
        with mock.patch.object(worker.sys, 'platform', 'darwin'), \
             mock.patch.object(worker.ctypes, 'CDLL', return_value=library):
            worker.rename_noreplace(11, 'a', 12, 'b')
        self.assertEqual(method.calls, [(11, b'a', 12, b'b', 4)])

    def test_destination_exists_is_conflict_on_both_platforms(self):
        for platform, name in (('darwin', 'renameatx_np'), ('linux', 'renameat2')):
            method = FakeFunction(result=-1)
            library = type('Library', (), {name: method})()
            with self.subTest(platform=platform), \
                 mock.patch.object(worker.sys, 'platform', platform), \
                 mock.patch.object(worker.ctypes, 'CDLL', return_value=library), \
                 mock.patch.object(worker.ctypes, 'get_errno', return_value=errno.EEXIST), \
                 self.assertRaisesRegex(worker.WorkerError, 'CONFLICT'):
                worker.rename_noreplace(1, 'a', 2, 'b')

    def test_unavailable_atomic_rename_does_not_fallback(self):
        with mock.patch.object(worker.sys, 'platform', 'darwin'), \
             mock.patch.object(worker.ctypes, 'CDLL', return_value=object()), \
             mock.patch.object(worker.os, 'rename', side_effect=AssertionError('unsafe fallback')), \
             self.assertRaisesRegex(worker.WorkerError, 'UNSUPPORTED_OPERATION'):
            worker.rename_noreplace(1, 'a', 2, 'b')

    def test_unsupported_filesystem_fails_closed(self):
        method = FakeFunction(result=-1)
        library = type('Library', (), {'renameatx_np': method})()
        with mock.patch.object(worker.sys, 'platform', 'darwin'), \
             mock.patch.object(worker.ctypes, 'CDLL', return_value=library), \
             mock.patch.object(worker.ctypes, 'get_errno', return_value=errno.ENOTSUP), \
             self.assertRaisesRegex(worker.WorkerError, 'UNSUPPORTED_OPERATION'):
            worker.rename_noreplace(1, 'a', 2, 'b')


if __name__ == '__main__':
    unittest.main()
