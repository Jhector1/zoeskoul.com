"""Run with python3 -B previewDependencyVerity_test.py (Linux or macOS).
Kernel behavior is tested separately on a real verity-enabled filesystem.
"""
import errno
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import previewDependencyVerity as v

class VerityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / 'node_modules'
        self.root.mkdir()
        self.file = self.root / 'test.js'
        self.file.write_bytes(b'abc')
        self.key = 'a' * 64
        # Mock only the kernel digest; actual tree traversal is exercised.
        def fake_measure(fd):
            return hashlib.sha256(os.pread(fd, 1024, 0)).digest()
        self.mock = patch.object(v, 'measure', fake_measure)
        self.mock.start()
        self.addCleanup(self.mock.stop)

    def scan(self, key=None):
        return v.scan(self.root, key or self.key)

    def test_stable_and_key_bound(self):
        first = self.scan()
        self.assertEqual(first, self.scan())
        self.assertNotEqual(first, self.scan('b' * 64))
        self.assertEqual((first['bytes'], first['files']), (3, 1))

    def test_replacement(self):
        first = self.scan()
        self.file.write_bytes(b'xyz')
        self.assertNotEqual(first, self.scan())

    def test_mode(self):
        first = self.scan()
        self.file.chmod(0o755)
        self.assertNotEqual(first, self.scan())

    def test_link(self):
        p = self.root / 'link'
        p.symlink_to('test.js')
        self.assertEqual(self.scan()['files'], 2)
        p.unlink()
        p.symlink_to('../outside')
        with self.assertRaises((v.Invalid, OSError)): self.scan()

    def test_hardlink(self):
        os.link(self.file, self.root / 'hard')
        with self.assertRaises(v.Invalid): self.scan()

    def test_fifo(self):
        os.mkfifo(self.root / 'pipe')
        with self.assertRaises(v.Invalid): self.scan()

    def test_unsealed(self):
        with patch.object(v, 'measure', side_effect=OSError(errno.ENODATA, 'unsealed')):
            with self.assertRaises(OSError): self.scan()

    def test_only_explicit_unsupported(self):
        parent = self.root.parent
        with patch.object(v, 'enable', side_effect=OSError(errno.EOPNOTSUPP, 'unsupported')):
            self.assertFalse(v.supported(parent))
        with patch.object(v, 'enable', side_effect=OSError(errno.EPERM, 'denied')):
            with self.assertRaises(OSError): v.supported(parent)
        self.assertEqual(list(parent.iterdir()), [self.root])

    def test_failure_mid_seal_is_not_unsupported(self):
        with patch.object(v, 'enable', side_effect=OSError(errno.EOPNOTSUPP, 'failed')):
            with self.assertRaises(OSError): v.scan(self.root, self.key, seal=True)

if __name__ == '__main__': unittest.main()
