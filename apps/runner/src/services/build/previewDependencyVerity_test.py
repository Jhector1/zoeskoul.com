"""Run with python3 -B previewDependencyVerity_test.py (Linux or macOS).
Kernel behavior is tested separately on a real verity-enabled filesystem.
"""
import errno
import hashlib
import os
import fcntl
import stat
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

    def test_readonly_modes_seal_and_restore(self):
        for mode in (0o444, 0o555, 0o644, 0o755):
            with self.subTest(mode=oct(mode)):
                self.file.chmod(mode)
                original = self.file.stat()
                def fake_enable(fd):
                    self.assertEqual(fcntl.fcntl(fd, fcntl.F_GETFL) & os.O_ACCMODE, os.O_RDONLY)
                    self.assertTrue(os.fstat(fd).st_mode & stat.S_IWUSR)
                with patch.object(v, 'enable', side_effect=fake_enable) as enabled:
                    sealed = v.scan(self.root, self.key, seal=True)
                    enabled.assert_called_once()
                self.assertEqual(stat.S_IMODE(self.file.stat().st_mode), mode)
                self.assertEqual(v.signature(original)[:-1], v.signature(self.file.stat())[:-1])
                self.assertEqual(sealed, self.scan())

    def test_readonly_mode_restored_after_kernel_failure(self):
        self.file.chmod(0o555)
        with patch.object(v, 'enable', side_effect=OSError(errno.EIO, 'failed')):
            with self.assertRaises(OSError): v.scan(self.root, self.key, seal=True)
        self.assertEqual(stat.S_IMODE(self.file.stat().st_mode), 0o555)

    def test_seal_rejects_changed_content_metadata(self):
        self.file.chmod(0o444)
        def mutate(fd):
            self.file.write_bytes(b'changed')
        with patch.object(v, 'enable', side_effect=mutate):
            with self.assertRaises(v.Invalid): v.scan(self.root, self.key, seal=True)
        self.assertEqual(stat.S_IMODE(self.file.stat().st_mode), 0o444)

    def test_kernel_mtime_change_is_accepted_only_when_bytes_match(self):
        for mode in (0o444, 0o555, 0o644, 0o755):
            with self.subTest(mode=oct(mode)):
                self.file.chmod(mode)
                original = self.file.stat()
                def fake_enable(fd):
                    os.utime(fd, ns=(original.st_atime_ns, original.st_mtime_ns + 1000000000))
                with patch.object(v, 'enable', side_effect=fake_enable):
                    sealed = v.scan(self.root, self.key, seal=True)
                after = self.file.stat()
                self.assertEqual(stat.S_IMODE(after.st_mode), mode)
                self.assertNotEqual(after.st_mtime_ns, original.st_mtime_ns)
                self.assertEqual(v.signature(after)[:7], v.signature(original)[:7])
                self.assertEqual(sealed, self.scan())

    def test_reject_same_size_mutation_even_with_restored_mtime(self):
        self.file.chmod(0o444)
        before = self.file.stat()
        def fake_enable(fd):
            self.file.write_bytes(b'xyz')
            os.utime(fd, ns=(before.st_atime_ns, before.st_mtime_ns))
        with patch.object(v, 'enable', side_effect=fake_enable):
            with self.assertRaises(v.Invalid):
                v.scan(self.root, self.key, seal=True)
        self.assertEqual(stat.S_IMODE(self.file.stat().st_mode), 0o444)

    def test_reject_kernel_interval_mode_change(self):
        self.file.chmod(0o444)
        def fake_enable(fd):
            os.fchmod(fd, 0o755)
        with patch.object(v, 'enable', side_effect=fake_enable):
            with self.assertRaises(v.Invalid):
                v.scan(self.root, self.key, seal=True)
        self.assertEqual(stat.S_IMODE(self.file.stat().st_mode), 0o444)

if __name__ == '__main__': unittest.main()
