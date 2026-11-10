#!/usr/bin/env python3
"""Guard admin image inputs before pushing any image to GHCR."""
from pathlib import Path
import re

root=Path(__file__).resolve().parents[2]
docker=(root/'apps/runner/runtime/learning-admin.Dockerfile').read_text()
init=(root/'apps/runner/runtime/learning-admin-init.sh').read_text()
pty=root/'apps/runner/pty-runner.py'
assert pty.is_file(), 'Missing canonical PTY runner'
assert 'FROM ubuntu:24.04' in docker
assert 'LABEL com.zoeskoul.learning.admin-lab="true"' in docker
assert 'COPY apps/runner/pty-runner.py' in docker
assert 'COPY apps/runner/runtime/learning-admin-init.sh' in docker
assert 'ENTRYPOINT ["/usr/bin/tini","--","/opt/runner/admin-init.sh"]' in docker
assert not re.search(r"(?:root|sandbox):learning|NOPASSWD|--privileged|docker.sock", docker, re.I)
assert "secrets.token_urlsafe" in init and "chpasswd" in init
assert "stat -f -c %T /workspace" in init
assert "/workspace/.lab-root-password" in init
assert 'chmod 0600 /workspace/.lab-root-password' in init
assert not re.search(r"(?:root|sandbox):learning", init, re.I)
print('LEARNING_ADMIN_IMAGE_SOURCE_GUARD_PASS')
