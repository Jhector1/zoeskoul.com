#!/usr/bin/env python3
"""PUB3A4A: loopback-only development hostname router, GET/HEAD only.

The private operator route map is a fixture, NOT a database ownership proof.
Never expose this listener publicly. Each request runs in a separate process
with a single project ROOT, reusing the verified private runtime controller.
"""
import argparse
import base64
import http.server
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import threading
import time
import tempfile
import fcntl

import control
import hosted_control as hosted
import hosted_committed_authority as authority
import pilot

PORT = 33108
DOMAIN = 'sites.zoebuild.test'
ROUTES = control.TOOLS / 'hosted-routes-dev.json'
DB_ROUTES = control.TOOLS / 'hosted-routes-db-dev.json'
LEASE_MS = 30_000
CLOCK_SKEW_MS = 2_000
LABEL = re.compile(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\Z')
MAX_WORKERS = 4


def valid_hostname(name):
    suffix = '.' + DOMAIN
    return isinstance(name, str) and name.endswith(suffix) and bool(LABEL.fullmatch(name[:-len(suffix)]))


def host_name(values, port):
    if len(values) != 1 or not isinstance(values[0], str):
        raise ValueError('Exactly one Host required')
    pilot.require(values[0].isascii(), 'Invalid host characters')
    value = values[0].lower()
    if value.endswith(':' + str(port)):
        value = value[:-(len(str(port)) + 1)]
    pilot.require(valid_hostname(value), 'Invalid host')
    return value


def route_map(raw, allow, legacy_id):
    pilot.require(isinstance(allow, dict) and set(allow) == {'projectIds'}, 'Invalid allowlist')
    ids = allow['projectIds']
    pilot.require(isinstance(ids, list) and 0 < len(ids) <= hosted.MAX_PROJECTS and all(isinstance(x, str) and pilot.ID.fullmatch(x) for x in ids), 'Invalid allowlist identity')
    pilot.require(len(set(ids)) == len(ids) and legacy_id not in ids, 'Invalid allowlist scope')
    pilot.require(isinstance(raw, dict) and set(raw) == {'routes'}, 'Invalid route map')
    routes = raw['routes']
    pilot.require(isinstance(routes, dict) and len(routes) <= hosted.MAX_PROJECTS, 'Invalid route count')
    pilot.require(all(valid_hostname(h) and isinstance(p, str) and p in ids for h, p in routes.items()), 'Invalid route identity')
    pilot.require(len(set(routes.values())) == len(routes), 'Multiple names for one project')
    return dict(routes)


def private_existing(path):
    st = path.lstat()
    pilot.require(stat.S_ISDIR(st.st_mode) and st.st_uid == os.getuid() and stat.S_IMODE(st.st_mode) == 0o700, 'Unsafe project path')
    return path


def lease_routes(raw, allow, legacy_id, now_ms):
    pilot.require(isinstance(raw, dict) and set(raw) == {'issuedAtMs', 'expiresAtMs', 'routes'}, 'Invalid database route snapshot')
    start, end = raw['issuedAtMs'], raw['expiresAtMs']
    pilot.require(type(start) is int and type(end) is int and start > 0 and end - start == LEASE_MS, 'Invalid route lease')
    pilot.require(start <= now_ms + CLOCK_SKEW_MS and now_ms < end, 'Database route lease unavailable')
    return route_map({'routes': raw['routes']}, allow, legacy_id)


def now_ms():
    return time.time_ns() // 1_000_000


def configured(database_routes=False):
    cfg = control.configuration()
    allow = control.read_private(hosted.ALLOWLIST)
    routes = (lease_routes(control.read_private(DB_ROUTES), allow, cfg['projectId'], now_ms())
              if database_routes else route_map(control.read_private(ROUTES), allow, cfg['projectId']))
    return cfg, routes


def install_snapshot(raw):
    # Private operator only: the exact allowlist and legacy identity are owned
    # by the VM, never by the sender. No public HTTP management endpoint.
    cfg = control.configuration()
    private_existing(DB_ROUTES.parent)
    lock = DB_ROUTES.with_suffix('.lock')
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        st = os.fstat(fd)
        pilot.require(stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid() and stat.S_IMODE(st.st_mode) == 0o600, 'Unsafe route lock')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lease_routes(raw, control.read_private(hosted.ALLOWLIST), cfg['projectId'], now_ms())
        if DB_ROUTES.exists() or DB_ROUTES.is_symlink():
            old = control.read_private(DB_ROUTES)
            pilot.require(isinstance(old, dict) and type(old.get('issuedAtMs')) is int and raw['issuedAtMs'] > old['issuedAtMs'], 'Out-of-order database route snapshot')
        tmpfd, tmp = tempfile.mkstemp(prefix='.routes-db-', dir=DB_ROUTES.parent)
        try:
            with os.fdopen(tmpfd, 'w') as f:
                json.dump(raw, f, separators=(',', ':')); f.write('\n'); f.flush(); os.fsync(f.fileno())
            os.replace(tmp, DB_ROUTES)
            dirfd = os.open(DB_ROUTES.parent, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(dirfd)
            finally: os.close(dirfd)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
    finally:
        os.close(fd)


def worker(host, project, method, path, database_routes=False):
    pilot.require(valid_hostname(host) and pilot.ID.fullmatch(project) and method in ('GET', 'HEAD') and pilot.safe_path(path), 'Invalid worker request')
    cfg, routes = configured(True) if database_routes else configured()
    pilot.require(routes.get(host) == project, 'Route authorization changed')
    parent = private_existing(pilot.ROOT.parent / 'hosted-publish-dev')
    pilot.ROOT = private_existing(parent / project)
    cfg = {**cfg, 'projectId': project}
    # Only the database route mode may serve fenced projects; no static fallback.
    if control.fenced_mode():
        if not database_routes:
            return None
        grant = authority.selected(host, project, cfg)
        if grant is None:
            return None
        state = authority.read_runtime(pilot.ROOT, project)
        if not authority.match_runtime(grant, state) or authority.selected(host, project, cfg) != grant:
            return None
        a = state['activation']
        active = {**a, 'artifactSha256': a['artifactHash']}
        del active['artifactHash']
        d, name, _ = control.resolve(cfg, active)
        result = pilot.fetch(d, name, path, method)
        # Revalidate exact grant identity and runtime after a slow fetch.
        if authority.selected(host, project, cfg) != grant or authority.read_runtime(pilot.ROOT, project) != state:
            return None
        # Last grant read also checks time after reading the runtime state.
        if authority.selected(host, project, cfg) != grant:
            return None
        return result
    active = control.pointer(cfg)
    if active is None:
        return None
    d, name, _ = control.resolve(cfg, active)
    result = pilot.fetch(d, name, path, method)
    if control.fenced_mode() or control.pointer(cfg) != active:
        return None
    return result



def serving_guard(host, project):
    # Parent-side identity check, including after the child returns. Never bind
    # the process-global pilot.ROOT inside this multithreaded server.
    cfg, routes = configured(True)
    if routes.get(host) != project:
        return None
    root = private_existing(private_existing(pilot.ROOT.parent/'hosted-publish-dev')/project)
    if not any(os.path.lexists(root/n) for n in (control.FENCED_MARKER, control.FENCED_STATE)):
        return ('legacy', project)
    grant = authority.selected(host, project, {**cfg,'projectId':project})
    if grant is None or not authority.match_runtime(grant, authority.read_runtime(root, project)):
        return None
    return ('fenced', grant)


def encode(result):
    if result is None:
        return b'null'
    status, mime, location, body = result
    return json.dumps([status, mime, location, base64.b64encode(body).decode('ascii')], separators=(',', ':')).encode()


def decode(raw):
    pilot.require(len(raw) <= (pilot.MAX_FILE * 4 // 3 + 4096), 'Worker response too large')
    data = pilot.unique_json(raw)
    if data is None:
        return None
    pilot.require(isinstance(data, list) and len(data) == 4, 'Invalid worker response')
    status, mime, location, body = data
    pilot.require(type(status) is int and 200 <= status <= 599, 'Invalid response status')
    pilot.require(isinstance(mime, str) and 0 < len(mime) <= 200 and not re.search(r'[^\x20-\x7e]', mime), 'Invalid content type')
    pilot.require(isinstance(location, str) and (not location or pilot.safe_path(location)), 'Invalid redirect')
    pilot.require(isinstance(body, str), 'Invalid response body')
    body = base64.b64decode(body, validate=True)
    pilot.require(len(body) <= pilot.MAX_FILE, 'Response too large')
    return status, mime, location, body


def fetch_worker(host, project, method, path, database_routes=False):
    # No shell, no forwarded headers or body, no user-selected executable or root.
    result = subprocess.run([sys.executable, '-B', str(Path(__file__).resolve()), *(['--database-routes'] if database_routes else []), '--worker', host, project, method, path], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60, check=True)
    return decode(result.stdout)


class Gateway(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, routes, fetch=fetch_worker, lookup=None, guard=None):
        self.routes = dict(routes)
        self.fetch = fetch
        self.lookup = lookup if lookup is not None else self.routes.get
        self.guard = guard
        self.slots = threading.BoundedSemaphore(MAX_WORKERS)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'
    server_version = 'ZoeBuildDevGateway'
    sys_version = ''

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *_):
        pass

    def do_GET(self):
        self.forward('GET')

    def do_HEAD(self):
        self.forward('HEAD')

    def do_POST(self):
        self.send_error(405)

    do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_CONNECT = do_TRACE = do_POST

    def forward(self, method):
        try:
            host = host_name(self.headers.get_all('Host', []), self.server.server_port)
            pilot.require(pilot.safe_path(self.path) and self.requestline.split()[1] == self.path, 'Invalid request target')
            pilot.require(not self.headers.get_all('Transfer-Encoding') and self.headers.get_all('Content-Length', []) in ([], ['0']), 'Request body unsupported')
        except (ValueError, IndexError):
            self.send_error(400)
            return
        try:
            project = self.server.lookup(host)
        except Exception:
            self.send_error(503)
            return
        if project is None:
            self.send_error(404)
            return
        try:
            before = self.server.guard(host, project) if self.server.guard else (project,)
            if before is None:
                self.send_error(404)
                return
            result = self.server.fetch(host, project, method, self.path)
        except Exception:
            self.send_error(502)
            return
        # Recheck after a potentially slow runtime fetch. A removed route or
        # expired lease must not deliver an old response from an in-flight worker.
        try:
            still_authorized = self.server.lookup(host) == project and (not self.server.guard or self.server.guard(host, project) == before)
        except Exception:
            self.send_error(503)
            return
        if not still_authorized or result is None:
            self.send_error(404)
            return
        status, mime, location, body = result
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        if location:
            self.send_header('Location', location)
        if method == 'GET':
            self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if method == 'GET':
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--serve', action='store_true')
    mode.add_argument('--worker', nargs=4, metavar=('HOST', 'PROJECT', 'METHOD', 'PATH'))
    mode.add_argument('--install-database-routes', action='store_true')
    mode.add_argument('--install-committed-grants', action='store_true')
    parser.add_argument('--database-routes', action='store_true')
    args = parser.parse_args()
    if args.install_committed_grants:
        pilot.require(not args.database_routes, 'Unexpected route mode')
        raw = sys.stdin.buffer.read(65537)
        pilot.require(0 < len(raw) <= 65536, 'Grant snapshot too large')
        authority.install(pilot.unique_json(raw))
        print('COMMITTED_GRANTS_INSTALLED=YES')
        return
    if args.install_database_routes:
        pilot.require(not args.database_routes, 'Unexpected route mode')
        raw = sys.stdin.buffer.read(65537)
        pilot.require(len(raw) <= 65536, 'Route snapshot too large')
        install_snapshot(pilot.unique_json(raw))
        print('DATABASE_ROUTE_SNAPSHOT_INSTALLED=YES')
        return
    if args.worker:
        sys.stdout.buffer.write(encode(worker(*args.worker, database_routes=args.database_routes)))
        return
    if args.database_routes:
        # No static-map fallback. A missing/expired snapshot is 503, an
        # unreserved hostname in a fresh snapshot is 404. Read on every request.
        control.configuration()
        gateway = Gateway(('127.0.0.1', PORT), {},
                          fetch=lambda *request: fetch_worker(*request, database_routes=True),
                          lookup=lambda host: configured(True)[1].get(host), guard=serving_guard)
    else:
        _, routes = configured()
        gateway = Gateway(('127.0.0.1', PORT), routes)
    with gateway as server:
        print(f'HOSTED_DEV_GATEWAY_READY=127.0.0.1:{PORT}', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        print('HOSTED_GATEWAY_FAILED=' + type(exc).__name__, file=sys.stderr)
        raise SystemExit(1)
