"""Candidate fenced runtime state. Not connected to legacy pilot or gateway.

Only a trusted, project-scoped provider may call apply(). prepare() must stage
and verify an immutable release without changing the served release or deleting
anything. Future routing must consume this record, not a second active pointer.
No automatic adoption of legacy pointers, missing state, or restored backups.
"""
import contextlib
import datetime
import fcntl
import json
import os
import re
import stat
from pathlib import Path

NAME = 'fenced-active-v1.json'
MAX = 2**63 - 1
ID = re.compile(r'[A-Za-z0-9_-]{4,128}')
HEX = re.compile(r'[a-f0-9]{64}')
TOKEN = re.compile(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00')
LIMIT = 16384


class FenceError(RuntimeError):
    pass


def require(ok, message):
    if not ok:
        raise FenceError(message)


def matches(pattern, value):
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def keys(value, expected):
    return isinstance(value, dict) and set(value) == set(expected)


def generation(value):
    # JSON decimal string, not JS number: PostgreSQL bigint precision.
    require(matches(re.compile(r'0|[1-9][0-9]{0,18}'), value), 'INVALID_FENCE')
    n = int(value)
    require(n <= MAX, 'INVALID_FENCE')
    return n


def target(value):
    require(keys(value, ('deploymentId', 'sourceVersion', 'artifactHash', 'objectSha256'))
            and matches(ID, value['deploymentId']) and type(value['sourceVersion']) is int
            and 0 < value['sourceVersion'] <= 2**53 - 1
            and matches(HEX, value['artifactHash']) and matches(HEX, value['objectSha256']), 'INVALID_TARGET')


def intent(value, project):
    require(keys(value, ('operationId', 'projectId', 'expectedGeneration', 'action', 'target'))
            and matches(ID, value['operationId']) and value['projectId'] == project
            and value['action'] in ('publish', 'rollback', 'unpublish'), 'INVALID_INTENT')
    require(generation(value['expectedGeneration']) < MAX, 'FENCE_EXHAUSTED')
    if value['action'] == 'unpublish':
        require(value['target'] is None, 'INVALID_TARGET')
    else:
        target(value['target'])


def identity(project, t):
    return {'projectId': project, **{k: t[k] for k in ('sourceVersion', 'artifactHash', 'objectSha256')}}


def validate_state(value, project):
    require(keys(value, ('version', 'projectId', 'fence', 'intent', 'activation'))
            and type(value['version']) is int and value['version'] == 1
            and value['projectId'] == project, 'INVALID_STATE')
    n = generation(value['fence'])
    op, a = value['intent'], value['activation']
    if n == 0:
        require(op is None and a is None, 'INVALID_INITIAL_STATE')
        return
    intent(op, project)
    require(generation(op['expectedGeneration']) + 1 == n, 'STATE_FENCE_MISMATCH')
    if op['action'] == 'unpublish':
        require(a is None, 'INVALID_INACTIVE_STATE')
        return
    expected = identity(project, op['target'])
    require(keys(a, (*expected, 'activatedAt')) and type(a['sourceVersion']) is int
            and all(a[k] == v for k, v in expected.items())
            and matches(TOKEN, a['activatedAt']), 'INVALID_ACTIVATION')
    try:
        datetime.datetime.fromisoformat(a['activatedAt'])
    except ValueError as exc:
        raise FenceError('INVALID_ACTIVATION_TOKEN') from exc


def unique(pairs):
    result = {}
    for k, v in pairs:
        require(k not in result, 'DUPLICATE_JSON_KEY')
        result[k] = v
    return result


def private_file(fd):
    st = os.fstat(fd)
    require(stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid()
            and stat.S_IMODE(st.st_mode) == 0o600 and st.st_nlink == 1, 'UNSAFE_FILE')


def ack(state):
    if state['intent'] is None:
        return None
    a = state['activation']
    result = {'operationId': state['intent']['operationId'], 'projectId': state['projectId'],
              'fence': state['fence'], 'state': 'applied-active' if a is not None else 'applied-inactive'}
    if a is not None:
        result['activation'] = a
    return result


class FencedState:
    def __init__(self, root, project):
        require(matches(ID, project), 'INVALID_PROJECT')
        self.root = Path(root)
        self.project = project

    @contextlib.contextmanager
    def locked(self):
        d = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            st = os.fstat(d)
            require(st.st_uid == os.getuid() and stat.S_IMODE(st.st_mode) == 0o700, 'UNSAFE_ROOT')
            lock = os.open('activation.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC,
                           0o600, dir_fd=d)
            try:
                private_file(lock)
                fcntl.flock(lock, fcntl.LOCK_EX)
                yield d
            finally:
                os.close(lock)
        finally:
            os.close(d)

    def _read(self, d):
        fd = os.open(NAME, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=d)
        with os.fdopen(fd, 'rb') as f:
            private_file(f.fileno())
            raw = f.read(LIMIT + 1)
        require(len(raw) <= LIMIT, 'STATE_TOO_LARGE')
        try:
            value = json.loads(raw, object_pairs_hook=unique)
        except (ValueError, UnicodeError, RecursionError) as exc:
            raise FenceError('INVALID_STATE_JSON') from exc
        validate_state(value, self.project)
        return value

    def _write(self, d, value):
        validate_state(value, self.project)
        raw = (json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n').encode()
        require(len(raw) <= LIMIT, 'STATE_TOO_LARGE')
        # Create in the already verified directory, avoiding a path re-resolution.
        tmp = '.fenced-' + os.urandom(16).hex()
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     0o600, dir_fd=d)
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(raw)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, NAME, src_dir_fd=d, dst_dir_fd=d)
            os.fsync(d)
        finally:
            try:
                os.unlink(tmp, dir_fd=d)
            except FileNotFoundError:
                pass

    def initialize_empty(self):
        """Explicit new empty project only. Never use to recover missing state."""
        with self.locked() as d:
            require(set(os.listdir(d)) == {'activation.lock'}, 'NONEMPTY_ROOT_REQUIRES_REVIEW')
            self._write(d, {'version': 1, 'projectId': self.project, 'fence': '0', 'intent': None, 'activation': None})

    def read(self):
        """Durable pointer/receipt, NOT proof of runtime health or route permission."""
        with self.locked() as d:
            state = self._read(d)
            os.fsync(d)  # Re-establish durability if a prior replacement lost its response.
            return state

    def apply(self, operation, prepare):
        """Apply the next fence; repeat exact latest intent without staging again.

        prepare(expected_identity) returns verified release identity with exactly
        those fields. It must never mutate the serving pointer or stop a release.
        Unpublish needs no preparation. A failure may leave an unknown outcome;
        callers must read the durable state rather than assume failure.
        """
        intent(operation, self.project)
        # Copy before external callback; no mutable caller state in committed intent.
        op = json.loads(json.dumps(operation, allow_nan=False))
        intent(op, self.project)
        with self.locked() as d:
            current = self._read(d)
            n = generation(current['fence'])
            previous = current['intent']
            if previous is not None and previous['operationId'] == op['operationId']:
                require(previous == op, 'OPERATION_ID_REUSED')
                os.fsync(d)
                return ack(current)
            require(generation(op['expectedGeneration']) == n, 'STALE_OR_FUTURE_FENCE')
            a = None
            if op['action'] != 'unpublish':
                expected = identity(self.project, op['target'])
                old = current['activation']
                if op['action'] == 'publish' and old is not None:
                    require(expected['sourceVersion'] >= old['sourceVersion'], 'ROLLBACK_REQUIRES_EXPLICIT_ACTION')
                prepared = prepare(dict(expected))
                require(keys(prepared, expected) and type(prepared['sourceVersion']) is int
                        and prepared == expected, 'PREPARED_IDENTITY_MISMATCH')
                a = {**expected, 'activatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds')}
            next_state = {'version': 1, 'projectId': self.project, 'fence': str(n+1), 'intent': op, 'activation': a}
            self._write(d, next_state)
            return ack(next_state)
