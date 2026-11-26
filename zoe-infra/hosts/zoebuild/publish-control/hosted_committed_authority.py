"""Private development activation grants. Hostname leases alone never grant fenced access.
A database-issued grant is bounded; it is not an entitlement or a public API.
"""
import datetime
import json
import os
from pathlib import Path
import stat
import tempfile
import time
import fcntl

import control
import hosted_control
from fenced_state import ID, HEX, TOKEN, NAME, FencedState, generation, matches, keys, require, private_file

GRANTS = control.TOOLS / 'hosted-committed-grants-dev.json'
TTL_MS = 10_000
SKEW_MS = 2_000
DOMAIN = '.sites.zoebuild.test'


def now_ms():
    return time.time_ns() // 1_000_000


def validate(snapshot, allow, legacy, now):
    require(keys(snapshot, ('issuedAtMs', 'expiresAtMs', 'grants')), 'INVALID_GRANT_SNAPSHOT')
    start, end = snapshot['issuedAtMs'], snapshot['expiresAtMs']
    require(type(start) is int and type(end) is int and start > 0 and end-start == TTL_MS
            and start <= now + SKEW_MS and now < end, 'GRANT_EXPIRED')
    require(keys(allow, ('projectIds',)), 'INVALID_GRANT_SCOPE')
    ids = allow['projectIds']
    require(isinstance(ids, list) and 0 < len(ids) <= hosted_control.MAX_PROJECTS
            and all(matches(ID, x) and x != legacy for x in ids) and len(set(ids)) == len(ids), 'INVALID_GRANT_SCOPE')
    grants = snapshot['grants']
    require(isinstance(grants, dict) and len(grants) <= len(ids), 'INVALID_GRANT_COUNT')
    import re
    seen = set()
    for host, g in grants.items():
        require(isinstance(host, str) and host.endswith(DOMAIN) and re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', host[:-len(DOMAIN)]), 'INVALID_GRANT_HOST')
        require(keys(g, ('projectId','deploymentId','operationId','fence','sourceVersion','artifactHash','objectSha256','activatedAt'))
                and isinstance(g['projectId'], str) and g['projectId'] in ids and g['projectId'] not in seen
                and matches(ID, g['deploymentId']) and matches(ID, g['operationId']) and generation(g['fence']) > 0
                and type(g['sourceVersion']) is int and 0 < g['sourceVersion'] <= 2147483647
                and matches(HEX, g['artifactHash']) and matches(HEX, g['objectSha256']) and matches(TOKEN, g['activatedAt']), 'INVALID_GRANT_IDENTITY')
        try: datetime.datetime.fromisoformat(g['activatedAt'])
        except ValueError: require(False, 'INVALID_GRANT_TOKEN')
        seen.add(g['projectId'])
    return grants


def selected(host, project, cfg):
    """Read a fresh database grant. No fallback to a hostname-only snapshot."""
    if not os.path.lexists(GRANTS): return None
    legacy = control.configuration()['projectId']
    require(legacy != project and cfg['projectId'] == project, 'INVALID_GRANT_SCOPE')
    grants = validate(control.read_private(GRANTS), control.read_private(hosted_control.ALLOWLIST), legacy, now_ms())
    g = grants.get(host)
    return g if g is not None and g['projectId'] == project else None


def match_runtime(grant, state):
    if grant is None or state['activation'] is None or state['intent'] is None: return False
    a, op = state['activation'], state['intent']
    return (state['fence'] == grant['fence'] and op['operationId'] == grant['operationId']
            and op['target']['deploymentId'] == grant['deploymentId']
            and all(a[k] == grant[k] for k in ('projectId','sourceVersion','artifactHash','objectSha256','activatedAt')))


def install(snapshot):
    """Authenticated operator stdin only; atomic, ordered and fail closed."""
    cfg = control.configuration()
    root = GRANTS.parent
    s = root.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o700, 'UNSAFE_GRANT_ROOT')
    fd = os.open(root/'hosted-committed-grants-dev.lock', os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_CLOEXEC, 0o600)
    try:
        private_file(fd)
        fcntl.flock(fd, fcntl.LOCK_EX|fcntl.LOCK_NB)
        validate(snapshot, control.read_private(hosted_control.ALLOWLIST), cfg['projectId'], now_ms())
        if os.path.lexists(GRANTS):
            previous = control.read_private(GRANTS)
            require(type(previous.get('issuedAtMs')) is int and previous['issuedAtMs'] < snapshot['issuedAtMs'], 'GRANT_REPLAY')
        tmpfd, tmp = tempfile.mkstemp(prefix='.committed-grants-',dir=root)
        try:
            with os.fdopen(tmpfd,'w') as f:
                json.dump(snapshot,f,separators=(',',':'),allow_nan=False);f.write('\n');f.flush();os.fsync(f.fileno())
            os.replace(tmp,GRANTS)
            d=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
            try: os.fsync(d)
            finally: os.close(d)
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
    finally: os.close(fd)


def read_runtime(root, project):
    # The record is atomically replaced. Read-only serving need not wait for a
    # potentially long preparation lock. A committed DB grant can only match
    # an already acknowledged, synchronized state; never use this for mutation.
    d = os.open(root, os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st = os.fstat(d)
        require(st.st_uid == os.getuid() and stat.S_IMODE(st.st_mode) == 0o700, 'UNSAFE_RUNTIME_ROOT')
        fd = os.open(control.FENCED_MARKER, os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC, dir_fd=d)
        with os.fdopen(fd,'rb') as f:
            private_file(f.fileno())
            require(f.read(32) == b'fenced-v1\n', 'INVALID_FENCED_MARKER')
        return FencedState(root, project)._read(d)
    finally: os.close(d)
