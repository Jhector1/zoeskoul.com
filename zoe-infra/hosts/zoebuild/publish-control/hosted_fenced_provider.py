"""Development-only fenced provider, bound by hosted_control to one project.

No legacy adoption, no public route grant, and no independent deployment engine.
Initialization is an explicit operator action on a genuinely empty project root.
"""
import contextlib
import os
import sys
import tempfile
from types import SimpleNamespace

import control
import pilot
from fenced_state import FencedState, ack, intent, LIMIT, NAME, require


def runtime(cfg):
    return FencedState(pilot.ROOT, cfg['projectId'])


def initialize(cfg):
    # The state file itself blocks legacy writes immediately. The separate
    # marker keeps them blocked if the state file subsequently goes missing.
    s = runtime(cfg)
    s.initialize_empty()
    with s.locked() as d:
        fd = os.open(control.FENCED_MARKER, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                     os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=d)
        with os.fdopen(fd, 'wb') as f:
            f.write(b'fenced-v1\n'); f.flush(); os.fsync(f.fileno())
        os.fsync(d)
    return {'fence': '0', 'acknowledgement': None}


def checked_runtime(cfg):
    require(control.fenced_mode(), 'FENCED_MODE_NOT_INITIALIZED')
    # Missing, corrupt or unsafe marker/state is never grounds for initialization.
    path = pilot.ROOT / control.FENCED_MARKER
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    from fenced_state import private_file
    with os.fdopen(fd, 'rb') as f:
        private_file(f.fileno())
        require(f.read(32) == b'fenced-v1\n', 'INVALID_FENCED_MARKER')
    return runtime(cfg)


def status(cfg):
    s = checked_runtime(cfg).read()
    return {'fence': s['fence'], 'acknowledgement': ack(s)}


def prepare(cfg, operation, raw, expected):
    value = {'projectId': expected['projectId'], 'sourceVersion': expected['sourceVersion'],
             'artifactSha256': expected['artifactHash'], 'objectSha256': expected['objectSha256']}
    if operation['action'] == 'rollback':
        require(not raw, 'ROLLBACK_BUNDLE_NOT_ALLOWED')
        control.smoke_retained(cfg, value)
        return expected
    require(0 < len(raw) <= pilot.MAX_OBJECT and pilot.sha(raw) == value['objectSha256'], 'BUNDLE_DIGEST_MISMATCH')
    identity, files = pilot.validate_bundle(raw, value['objectSha256'])
    require(all(identity[k] == v for k, v in value.items()), 'BUNDLE_IDENTITY_MISMATCH')
    directory = pilot.ROOT / value['objectSha256']
    if not directory.exists() and not directory.is_symlink():
        count = sum(1 for p in pilot.ROOT.iterdir() if pilot.HEX.fullmatch(p.name))
        require(count < control.MAX_RELEASES, 'RELEASE_LIMIT')
        fd, tmp = tempfile.mkstemp(prefix='.incoming-', dir=pilot.ROOT)
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(raw)
            with contextlib.redirect_stdout(sys.stderr):
                pilot.deploy(SimpleNamespace(bundle=tmp, sha=value['objectSha256'], image=cfg['image'], revision=cfg['revision']))
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
    d, name, _ = control.resolve(cfg, value)
    with contextlib.redirect_stdout(sys.stderr):
        pilot.smoke(d, name, files)
    return expected


def apply(cfg, frame):
    header, separator, raw = frame.partition(b'\n')
    require(separator and 0 < len(header) <= LIMIT and len(raw) <= pilot.MAX_OBJECT, 'INVALID_FRAME')
    operation = pilot.unique_json(header)
    intent(operation, cfg['projectId'])
    # Validate the frame even on exact replay; the actual preparation is only
    # performed inside the existing activation lock by FencedState.apply.
    if operation['action'] == 'publish':
        require(bool(raw) and pilot.sha(raw) == operation['target']['objectSha256'], 'BUNDLE_DIGEST_MISMATCH')
    else:
        require(not raw, 'UNEXPECTED_BUNDLE')
    s = checked_runtime(cfg)
    return s.apply(operation, lambda expected: prepare(cfg, operation, raw, expected))
