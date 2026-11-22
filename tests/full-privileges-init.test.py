#!/usr/bin/env python3
from pathlib import Path
import unittest
class RootLabInitializationContract(unittest.TestCase):
    def test_per_lab_student_and_root_passwords(self):
        source = Path(__file__).resolve().parents[1] / "apps/runner/runtime/learning-admin-init.sh"
        contents = source.read_text()
        self.assertIn("'root:%s", contents)
        self.assertIn("'sandbox:%s", contents)
        self.assertIn("/workspace/.lab-root-password", contents)
        self.assertIn("/workspace/.lab-student-password", contents)
        self.assertNotIn("NOPASSWD", contents)
        self.assertIn('!= "tmpfs"', contents)
if __name__ == "__main__": unittest.main()
