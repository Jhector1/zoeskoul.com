#!/usr/bin/env bash
set -euo pipefail
image="${1:?usage: smoke-admin-image.sh IMAGE}"
# CI smoke only; no Docker daemon socket, host bind, network, or privileged flag.
echo '=== Image identity and runtime prerequisites ==='
label="$(docker image inspect --format '{{index .Config.Labels "com.zoeskoul.learning.admin-lab"}}' "$image")"
test "$label" = true

docker run --rm --network none --cap-drop ALL \
  --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
  --cap-add SETUID --cap-add SETGID \
  --memory 192m --memory-swap 192m --cpus 0.5 --pids-limit 48 \
  --tmpfs /workspace:rw,nodev,nosuid,size=16m,mode=1777 \
  --tmpfs /tmp:rw,nodev,nosuid,size=8m,mode=1777 \
  -e PATH=/usr/bin:/bin \
  --entrypoint /opt/runner/admin-init.sh \
  "$image" /bin/bash -ec '
    test "$(id -u)" = 0
    test "$PATH" = /usr/bin:/bin
    test -x /usr/sbin/chpasswd
    test "$(stat -c %a:%u /workspace/.lab-root-password)" = 600:1000
    test "$(wc -c < /workspace/.lab-root-password)" -ge 24
    test "$(su - sandbox -c "id -u")" = 1000
    test "$(su - sandbox -c "test -r /workspace/.lab-root-password && echo ok")" = ok
    test -x /opt/runner/pty-runner.py
    # Test a real PAM su transition. Wait for Password: before typing.
    cat > /tmp/check-su-root.py << "SMOKE_PY"
#!/usr/bin/env python3
# Test real PAM su with a PTY and a prompt-aware password exchange.
# Never print or log the generated root password.
import errno
import os
import pty
import re
import select
import signal
import sys
import time

with open("/workspace/.lab-root-password", "rb") as f:
    password = f.readline().strip()
if len(password) < 24 or b"\n" in password:
    print("SU_ROOT_SMOKE_FAILED_INVALID_PASSWORD_FILE", file=sys.stderr)
    raise SystemExit(1)

pid, master = pty.fork()
if pid == 0:
    os.execvp("su", ["su", "root", "-c", "test \"$(id -u)\" = 0 && printf SU_ROOT_PTY_OK"])

sent = False
transcript = bytearray()
deadline = time.monotonic() + 20.0
timed_out = False
try:
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            timed_out = True
            break
        readable, _, _ = select.select([master], [], [], min(remaining, 0.5))
        if not readable:
            continue
        try:
            chunk = os.read(master, 4096)
        except OSError as exc:
            if exc.errno == errno.EIO:
                break
            raise
        if not chunk:
            break
        # Bound storage and never emit this transcript: password echo is possible.
        transcript.extend(chunk)
        if len(transcript) > 16384:
            print("SU_ROOT_SMOKE_FAILED_OUTPUT_LIMIT", file=sys.stderr)
            break
        if not sent and re.search(rb"password\s*:", transcript, re.IGNORECASE):
            os.write(master, password + b"\n")
            sent = True
finally:
    os.close(master)
    if timed_out:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    _, status = os.waitpid(pid, 0)

if sent and not timed_out and os.waitstatus_to_exitcode(status) == 0 and b"SU_ROOT_PTY_OK" in transcript:
    print("SU_ROOT_SMOKE_PASS")
else:
    if timed_out:
        reason = "TIMEOUT"
    elif not sent:
        reason = "NO_PASSWORD_PROMPT"
    elif b"Authentication failure" in transcript or b"authentication failure" in transcript:
        reason = "AUTHENTICATION_FAILURE"
    elif b"Permission denied" in transcript or b"permission denied" in transcript:
        reason = "PERMISSION_DENIED"
    elif b"SU_ROOT_PTY_OK" not in transcript:
        reason = "ROOT_COMMAND_NOT_CONFIRMED"
    else:
        reason = "CHILD_EXIT_NONZERO"
    print("SU_ROOT_SMOKE_FAILED_" + reason, file=sys.stderr)
    raise SystemExit(1)
SMOKE_PY
    chmod 0644 /tmp/check-su-root.py
    su - sandbox -c "python3 /tmp/check-su-root.py"
    echo LEARNING_ADMIN_IMAGE_SMOKE_PASS
  '
