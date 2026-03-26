#!/usr/bin/env python3
import errno
import fcntl
import os
import pty
import select
import struct
import subprocess
import sys
import termios
import tty

COMPILE_CMD = os.environ.get("COMPILE_CMD", "").strip()
RUN_CMD = os.environ.get("RUN_CMD", "").strip()

if not RUN_CMD:
    print("Missing RUN_CMD", file=sys.stderr)
    sys.exit(1)

parts = []
if COMPILE_CMD:
    parts.append(COMPILE_CMD)
parts.append(RUN_CMD)
FULL_CMD = " && ".join(parts)


def set_winsize(fd: int, rows: int, cols: int) -> None:
    packed = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)


def main() -> int:
    master_fd, slave_fd = pty.openpty()

    rows = int(os.environ.get("LINES", "30"))
    cols = int(os.environ.get("COLUMNS", "120"))
    set_winsize(slave_fd, rows, cols)

    proc = subprocess.Popen(
        ["/bin/bash", "-lc", FULL_CMD],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True,
        start_new_session=True,
    )

    os.close(slave_fd)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()

    original_stdin_attrs = None

    try:
        if os.isatty(stdin_fd):
            original_stdin_attrs = termios.tcgetattr(stdin_fd)
            tty.setraw(stdin_fd, when=termios.TCSANOW)

        while True:
            read_fds = [master_fd, stdin_fd]
            ready, _, _ = select.select(read_fds, [], [], 0.1)

            if master_fd in ready:
                try:
                    data = os.read(master_fd, 4096)
                except OSError as e:
                    if e.errno == errno.EIO:
                        data = b""
                    else:
                        raise

                if data:
                    os.write(stdout_fd, data)
                else:
                    break

            if stdin_fd in ready:
                data = os.read(stdin_fd, 4096)
                if not data:
                    break
                os.write(master_fd, data)

            if proc.poll() is not None:
                try:
                    trailing = os.read(master_fd, 4096)
                    if trailing:
                        os.write(stdout_fd, trailing)
                except OSError:
                    pass

                if not ready:
                    break

        return proc.wait()
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


if __name__ == "__main__":
    sys.exit(main())