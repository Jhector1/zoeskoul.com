#!/usr/bin/env python3
import errno
import json
import os
import pty
import re
import resource
import select
import signal
import struct
import sys
import termios
import tty
from typing import Optional


SAFE_REL_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")
CHILD_PID: Optional[int] = None


def load_json_argv(name: str, required: bool) -> Optional[list[str]]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        if required:
            print(f"Missing {name}", file=sys.stderr)
            sys.exit(1)
        return None

    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        print(f"Invalid JSON in {name}", file=sys.stderr)
        sys.exit(1)

    if value is None and not required:
        return None

    if not isinstance(value, list) or not all(isinstance(x, str) and x for x in value):
        print(f"{name} must be a JSON array of non-empty strings", file=sys.stderr)
        sys.exit(1)

    return value


def load_json_string_list(name: str) -> list[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return []

    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        print(f"Invalid JSON in {name}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
        print(f"{name} must be a JSON array of strings", file=sys.stderr)
        sys.exit(1)

    return value


def assert_safe_rel_path(p: str) -> str:
    normalized = str(p or "").replace("\\", "/").strip()

    if not normalized:
        print("Unsafe empty path", file=sys.stderr)
        sys.exit(1)

    if normalized.startswith("/") or "\x00" in normalized:
        print(f"Unsafe path: {p}", file=sys.stderr)
        sys.exit(1)

    if not SAFE_REL_PATH.fullmatch(normalized):
        print(f"Disallowed path chars: {p}", file=sys.stderr)
        sys.exit(1)

    for part in normalized.split("/"):
        if not part or part == "." or part == "..":
            print(f"Unsafe path: {p}", file=sys.stderr)
            sys.exit(1)

    return normalized


def ensure_prepare_dirs(dirs: list[str]) -> None:
    for d in dirs:
        safe = assert_safe_rel_path(d)
        os.makedirs(os.path.join("/workspace", safe), exist_ok=True)


def set_winsize(fd: int, rows: int, cols: int) -> None:
    packed = struct.pack("HHHH", rows, cols, 0, 0)
    import fcntl
    fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)


def make_tty_sane(fd: int) -> None:
    attrs = termios.tcgetattr(fd)

    iflag = attrs[0]
    oflag = attrs[1]
    cflag = attrs[2]
    lflag = attrs[3]
    cc = attrs[6]

    iflag |= termios.BRKINT | termios.ICRNL | termios.IXON
    oflag |= termios.OPOST | termios.ONLCR
    cflag |= termios.CREAD
    lflag |= termios.ISIG | termios.ICANON | termios.ECHO | termios.IEXTEN

    cc[termios.VMIN] = 1
    cc[termios.VTIME] = 0

    attrs[0] = iflag
    attrs[1] = oflag
    attrs[2] = cflag
    attrs[3] = lflag
    attrs[6] = cc

    termios.tcsetattr(fd, termios.TCSANOW, attrs)


def try_set_outer_stdin_raw(fd: int):
    try:
        original = termios.tcgetattr(fd)
    except Exception:
        return None

    try:
        tty.setraw(fd, when=termios.TCSANOW)
        return original
    except Exception:
        try:
            tty.setcbreak(fd, when=termios.TCSANOW)
            return original
        except Exception:
            return None


def apply_rlimits() -> None:
    try:
        resource.setrlimit(resource.RLIMIT_NOFILE, (1024, 1024))
    except Exception:
        pass

    # Do not cap RLIMIT_NPROC for interactive PTY shells.
    # It is per real UID, so with many session containers sharing the same
    # user it can cause "bash: fork: Resource temporarily unavailable".
    # Rely on container-level limits instead.

    try:
        resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024))
    except Exception:
        pass

    try:
        resource.setrlimit(resource.RLIMIT_STACK, (8 * 1024 * 1024, 8 * 1024 * 1024))
    except Exception:
        pass


def build_env() -> dict[str, str]:
    env = dict(os.environ)

    env.setdefault("TERM", "xterm-256color")
    env.setdefault("PATH", "/usr/bin:/bin")
    env.setdefault("HOME", "/workspace")
    env.setdefault("LANG", "C.UTF-8")
    env.setdefault("PYTHONUNBUFFERED", "1")
    env.setdefault("BASH_ENV", "/dev/null")
    env.setdefault("ENV", "/dev/null")

    env.setdefault("HISTFILE", "/workspace/.bash_history")
    env.setdefault("HISTSIZE", "500")
    env.setdefault("HISTFILESIZE", "1000")
    env.setdefault("HISTCONTROL", "ignoredups:erasedups")
    env.setdefault("PROMPT_COMMAND", "history -a; history -n")

    if not env.get("PS1"):
        env["PS1"] = "[zoeskoul]\\w\\$ "

    return env


def kill_child(sig: int) -> None:
    global CHILD_PID
    if CHILD_PID is None:
        return
    try:
        os.kill(CHILD_PID, sig)
    except ProcessLookupError:
        pass
    except Exception:
        pass


def handle_signal(signum, _frame):
    kill_child(signal.SIGTERM)
    raise SystemExit(128 + signum)


def exec_in_pty(argv: list[str], env: dict[str, str], rows: int, cols: int) -> tuple[int, int]:
    pid, master_fd = pty.fork()

    if pid == 0:
        try:
            apply_rlimits()
            try:
                set_winsize(0, rows, cols)
            except OSError:
                pass
            try:
                make_tty_sane(0)
            except OSError:
                pass
            os.chdir("/workspace")
            os.execvpe(argv[0], argv, env)
        except Exception as e:
            print(str(e), file=sys.stderr)
            os._exit(127)

    return pid, master_fd


def read_from_master(master_fd: int) -> Optional[bytes]:
    try:
        data = os.read(master_fd, 4096)
    except OSError as e:
        if e.errno == errno.EIO:
            return None
        raise

    if not data:
        return None

    return data


def forward_master_to_stdout(master_fd: int, stdout_fd: int) -> bool:
    data = read_from_master(master_fd)
    if data is None:
        return False
    os.write(stdout_fd, data)
    return True


def drain_available_output(master_fd: int, stdout_fd: int) -> None:
    while True:
        ready, _, _ = select.select([master_fd], [], [], 0)
        if master_fd not in ready:
            break
        try:
            if not forward_master_to_stdout(master_fd, stdout_fd):
                break
        except OSError:
            break


def wait_pid_exit_code(pid: int) -> int:
    while True:
        waited_pid, status = os.waitpid(pid, 0)
        if waited_pid != pid:
            continue

        if os.WIFEXITED(status):
            return os.WEXITSTATUS(status)

        if os.WIFSIGNALED(status):
            return 128 + os.WTERMSIG(status)

        return 1


def run_noninteractive_phase(argv: list[str], env: dict[str, str], rows: int, cols: int, stdout_fd: int) -> int:
    global CHILD_PID

    pid, master_fd = exec_in_pty(argv, env, rows, cols)
    CHILD_PID = pid

    try:
        while True:
            ready, _, _ = select.select([master_fd], [], [], 0.1)

            if master_fd in ready:
                try:
                    if not forward_master_to_stdout(master_fd, stdout_fd):
                        break
                except OSError:
                    break

            done_pid, status = os.waitpid(pid, os.WNOHANG)
            if done_pid == pid:
                drain_available_output(master_fd, stdout_fd)
                if os.WIFEXITED(status):
                    return os.WEXITSTATUS(status)
                if os.WIFSIGNALED(status):
                    return 128 + os.WTERMSIG(status)
                return 1
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass

    return wait_pid_exit_code(pid)


def run_interactive_phase(
    argv: list[str],
    env: dict[str, str],
    rows: int,
    cols: int,
    stdin_fd: int,
    stdout_fd: int,
) -> int:
    global CHILD_PID

    pid, master_fd = exec_in_pty(argv, env, rows, cols)
    CHILD_PID = pid

    original_stdin_attrs = None

    try:
        original_stdin_attrs = try_set_outer_stdin_raw(stdin_fd)

        while True:
            read_fds = [master_fd, stdin_fd]
            ready, _, _ = select.select(read_fds, [], [], 0.1)

            if master_fd in ready:
                try:
                    data = os.read(master_fd, 4096)
                    if not data:
                        break
                    os.write(stdout_fd, data)
                except OSError as e:
                    if e.errno == errno.EIO:
                        break
                    raise

            if stdin_fd in ready:
                data = os.read(stdin_fd, 4096)
                if not data:
                    break
                os.write(master_fd, data)

            done_pid, status = os.waitpid(pid, os.WNOHANG)
            if done_pid == pid:
                drain_available_output(master_fd, stdout_fd)
                if os.WIFEXITED(status):
                    return os.WEXITSTATUS(status)
                if os.WIFSIGNALED(status):
                    return 128 + os.WTERMSIG(status)
                return 1

        return wait_pid_exit_code(pid)
    finally:
        if original_stdin_attrs is not None:
            try:
                termios.tcsetattr(stdin_fd, termios.TCSANOW, original_stdin_attrs)
            except OSError:
                pass

        try:
            os.close(master_fd)
        except OSError:
            pass


def main() -> int:
    prepare_dirs = load_json_string_list("PREPARE_DIRS_JSON")
    compile_cmd = load_json_argv("COMPILE_CMD_JSON", required=False)
    run_cmd = load_json_argv("RUN_CMD_JSON", required=True)

    ensure_prepare_dirs(prepare_dirs)

    rows = int(os.environ.get("LINES", "30"))
    cols = int(os.environ.get("COLUMNS", "120"))

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    env = build_env()
    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()

    if compile_cmd:
        compile_rc = run_noninteractive_phase(
            compile_cmd,
            env,
            rows,
            cols,
            stdout_fd,
        )
        if compile_rc != 0:
            return compile_rc

    return run_interactive_phase(
        run_cmd,
        env,
        rows,
        cols,
        stdin_fd,
        stdout_fd,
    )


if __name__ == "__main__":
    sys.exit(main())