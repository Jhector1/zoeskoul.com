"""Regression tests for Docker's closed-stdin, Tty=false trusted build path.

These tests do not require Docker, ports, root privileges, or a /workspace mount.
"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

RUNTIME = Path(__file__).with_name("pty-runner.py")


def invoke(command, *, compile_command=None, mode="oneshot", max_file_bytes=None):
    with tempfile.TemporaryDirectory(prefix="p3b3-runtime-oneshot-") as cwd:
        # Replace only cwd lookup in this isolated subprocess: production still
        # uses the launcher's existing /workspace containment policy.
        code = """import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("runtime_under_test", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.resolve_start_cwd = lambda: os.getcwd()
sys.exit(module.main())
"""
        env = dict(os.environ)
        env["RUN_CMD_JSON"] = json.dumps(command)
        env["RUNNER_EXEC_MODE"] = mode
        env.pop("COMPILE_CMD_JSON", None)
        if compile_command is not None:
            env["COMPILE_CMD_JSON"] = json.dumps(compile_command)
        if max_file_bytes is not None:
            env["RUNNER_MAX_FILE_WRITE_BYTES"] = str(max_file_bytes)
        return subprocess.run(
            [sys.executable, "-c", code, str(RUNTIME)],
            cwd=cwd, env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=12, check=False,
        )


class OneShotRuntimeTests(unittest.TestCase):
    def test_closed_stdin_still_forwards_both_streams(self):
        result = invoke([sys.executable, "-c", "import sys; print('P3B3_OUT', flush=True); print('P3B3_ERR', file=sys.stderr, flush=True)"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(b"P3B3_OUT", result.stdout)
        self.assertIn(b"P3B3_ERR", result.stderr)

    def test_large_output_does_not_deadlock(self):
        result = invoke([sys.executable, "-c", "import sys; sys.stdout.write('Z' * 524288); sys.stdout.flush()"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(result.stdout), 524288)

    def test_child_exit_code_is_not_lost(self):
        result = invoke([sys.executable, "-c", "import sys; print('before-exit', flush=True); sys.exit(23)"])
        self.assertEqual(result.returncode, 23)
        self.assertIn(b"before-exit", result.stdout)

    def test_compile_runs_first_and_stops_on_error(self):
        compile_cmd = [sys.executable, "-c", "import sys; print('COMPILE_FAIL', flush=True); sys.exit(19)"]
        main_cmd = [sys.executable, "-c", "print('MUST_NOT_EXECUTE')"]
        result = invoke(main_cmd, compile_command=compile_cmd)
        self.assertEqual(result.returncode, 19)
        self.assertIn(b"COMPILE_FAIL", result.stdout)
        self.assertNotIn(b"MUST_NOT_EXECUTE", result.stdout)

    def test_rlimit_fsize_still_enforced(self):
        code = "import resource; print(resource.getrlimit(resource.RLIMIT_FSIZE)[0], flush=True)"
        result = invoke([sys.executable, "-c", code], max_file_bytes=16777216)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), b"16777216")

    def test_unknown_mode_fails_closed(self):
        result = invoke([sys.executable, "-c", "print('MUST_NOT_EXECUTE')"], mode="unknown")
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(b"MUST_NOT_EXECUTE", result.stdout)

    def test_legacy_default_still_selects_interactive_path(self):
        # Verify dispatch via a mocked interactive phase, without requiring PTY.
        import importlib.util
        spec = importlib.util.spec_from_file_location("runtime_mode_probe", RUNTIME)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.load_json_argv = lambda name, required: ["ignored"] if required else None
        module.load_json_string_list = lambda _name: []
        module.resolve_start_cwd = lambda: "/tmp"
        module.run_interactive_phase = lambda *_args: 71
        module.run_one_shot_phase = lambda *_args: 72
        old = os.environ.pop("RUNNER_EXEC_MODE", None)
        try:
            self.assertEqual(module.main(), 71)
        finally:
            if old is not None: os.environ["RUNNER_EXEC_MODE"] = old


if __name__ == "__main__":
    unittest.main()
