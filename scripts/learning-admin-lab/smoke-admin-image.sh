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
  --entrypoint /opt/runner/admin-init.sh \
  "$image" /bin/bash -ec '
    test "$(id -u)" = 0
    test "$(stat -c %a:%u /workspace/.lab-root-password)" = 600:1000
    test "$(wc -c < /workspace/.lab-root-password)" -ge 24
    test "$(su - sandbox -c "id -u")" = 1000
    test "$(su - sandbox -c "test -r /workspace/.lab-root-password && echo ok")" = ok
    test -x /opt/runner/pty-runner.py
    # Exercise the real PAM su transition as sandbox -> root via a PTY.
    cat > /tmp/check-su-root.sh << "SMOKE"
#!/bin/bash
set -euo pipefail
password="$(cat /workspace/.lab-root-password)"
result="$(printf "%s\n" "$password" | script -q -c "su root -c id" /dev/null)"
case "$result" in
  *"uid=0(root)"*) exit 0 ;;
  *) echo "SU_ROOT_SMOKE_FAILED" >&2; exit 1 ;;
esac
SMOKE
    chmod 755 /tmp/check-su-root.sh
    su - sandbox -c "bash /tmp/check-su-root.sh"
    echo LEARNING_ADMIN_IMAGE_SMOKE_PASS
  '
