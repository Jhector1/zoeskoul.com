#!/usr/bin/env python3
"""Local reference tests only. Not authorization or production Runner integration."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
import os
from reference_mode_audit import audit, TARGETS

class AuditTests(TestCase):
    def fixture(self, parent: Path) -> Path:
        root = parent/'secure-project'
        root.mkdir(mode=0o755)
        (root/'scripts').mkdir(mode=0o700)
        (root/'shared').mkdir(mode=0o770)
        for rel in ('README.md','scripts/run.sh','secrets.env'):
            (root/rel).write_text('safe sample\n')
        for rel, (_, mode) in TARGETS.items():
            os.chmod(root if rel == '.' else root/rel,mode)
        return root

    def test_correct_real_modes(self):
        with TemporaryDirectory() as tmp:
            self.assertEqual(audit(self.fixture(Path(tmp))),[])

    def test_wrong_actual_inode_mode_detected(self):
        with TemporaryDirectory() as tmp:
            root = self.fixture(Path(tmp))
            os.chmod(root/'secrets.env',0o644)
            self.assertIn('secrets.env: mode is 644, expected 600',audit(root))

    def test_symlink_escape_rejected(self):
        with TemporaryDirectory() as tmp:
            root = self.fixture(Path(tmp))
            (root/'secrets.env').unlink()
            (root/'secrets.env').symlink_to('/etc/passwd')
            self.assertTrue(any('symlink' in x for x in audit(root)))

    def test_unexpected_extra_file_rejected(self):
        with TemporaryDirectory() as tmp:
            root = self.fixture(Path(tmp))
            (root/'unknown.txt').write_text('extra')
            self.assertTrue(any('unexpected entries' in x for x in audit(root)))

    def test_wrong_owner_detected(self):
        with TemporaryDirectory() as tmp:
            root = self.fixture(Path(tmp))
            self.assertTrue(any('owner mismatch' in x for x in audit(root,owner_uid=os.getuid()+1)))

if __name__ == '__main__':main(verbosity=2)
