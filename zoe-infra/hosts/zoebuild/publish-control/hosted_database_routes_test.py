"""Database route lease acceptance using real loopback HTTP and private files."""
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import hosted_gateway as g
import control
import pilot

A = 'alpha.sites.zoebuild.test'
B = 'beta.sites.zoebuild.test'
ROUTES = {A:'project-alpha', B:'project-beta'}
ALLOW = {'projectIds': list(ROUTES.values())}
CFG = {'projectId':'legacy-project'}
NOW = 1_800_000_000_000

def snap(routes=ROUTES, start=NOW):
    return {'issuedAtMs':start,'expiresAtMs':start+g.LEASE_MS,'routes':routes}

class LeaseTests(unittest.TestCase):
    def test_fresh_empty_and_expired(self):
        self.assertEqual(g.lease_routes(snap(),ALLOW,CFG['projectId'],NOW),ROUTES)
        self.assertEqual(g.lease_routes(snap({}),ALLOW,CFG['projectId'],NOW),{})
        for raw,clock in [(snap(),NOW+g.LEASE_MS),(snap(),NOW-g.CLOCK_SKEW_MS-1),(dict(snap(),expiresAtMs=NOW+90000),NOW),(dict(snap(),issuedAtMs=True),NOW),(dict(snap(),extra=1),NOW)]:
            with self.assertRaises(ValueError):g.lease_routes(raw,ALLOW,CFG['projectId'],clock)
    def test_allowlist_rechecked(self):
        for routes in [{A:'legacy-project'},{A:'unknown-project'},{A:'project-alpha',B:'project-alpha'}]:
            with self.assertRaises(ValueError):g.lease_routes(snap(routes),ALLOW,CFG['projectId'],NOW)
        with self.assertRaises(ValueError):g.lease_routes(snap(),{'projectIds':['project-alpha']},CFG['projectId'],NOW)
    def test_atomic_install_and_replay(self):
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'db.json'
            orig=control.read_private
            def read(p):return orig(p) if p==file else ALLOW
            with patch.object(g,'DB_ROUTES',file),patch.object(g,'now_ms',return_value=NOW+2),patch.object(control,'configuration',return_value=CFG),patch.object(control,'read_private',side_effect=read):
                g.install_snapshot(snap());self.assertEqual(g.configured(True)[1],ROUTES)
                self.assertEqual(file.stat().st_mode&0o777,0o600)
                g.install_snapshot(snap({B:ROUTES[B]},NOW+1))
                with self.assertRaises(ValueError):g.install_snapshot(snap())
                self.assertEqual(g.configured(True)[1],{B:ROUTES[B]})
                with self.assertRaises(ValueError):g.install_snapshot(snap({A:'unknown-project'},NOW+2))
                self.assertEqual(g.configured(True)[1],{B:ROUTES[B]})
    def test_worker_rechecks_lease_mode(self):
        with patch.object(g,'configured',return_value=(CFG,{})) as configured,patch.object(control,'pointer') as pointer:
            with self.assertRaises(ValueError):g.worker(A,ROUTES[A],'GET','/',True)
            configured.assert_called_once_with(True);pointer.assert_not_called()
    def test_expiry_during_fetch_drops_response(self):
        state={'clock':NOW}
        def lookup(host):return g.lease_routes(snap(),ALLOW,CFG['projectId'],state['clock']).get(host)
        def fetch(*args):state['clock']=NOW+g.LEASE_MS;return 200,'text/plain','',b'not authorized anymore'
        with g.Gateway(('127.0.0.1',0),{},fetch,lookup) as server:
            thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':0.01},daemon=True);thread.start()
            try:
                c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                try:
                    c.request('GET','/',headers={'Host':A});r=c.getresponse();self.assertEqual(r.status,503);self.assertNotIn(b'not authorized anymore',r.read())
                finally:c.close()
            finally:server.shutdown();thread.join(2)

    def test_dynamic_http_refresh_and_expiry_no_fallback(self):
        state={'raw':snap(), 'clock':NOW};calls=[]
        def lookup(host):return g.lease_routes(state['raw'],ALLOW,CFG['projectId'],state['clock']).get(host)
        def fetch(host,project,method,path):calls.append(project);return 200,'text/plain','',project.encode()
        with g.Gateway(('127.0.0.1',0),ROUTES,fetch,lookup) as server:
            thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':0.01},daemon=True);thread.start()
            def request(host):
                c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                try:
                    c.request('GET','/',headers={'Host':host});r=c.getresponse();return r.status,r.read()
                finally:c.close()
            try:
                self.assertEqual(request(A),(200,b'project-alpha'))
                state['raw']=snap({B:ROUTES[B]},NOW+1);state['clock']=NOW+1
                self.assertEqual(request(A)[0],404);self.assertEqual(request(B),(200,b'project-beta'))
                state['clock']=NOW+1+g.LEASE_MS
                self.assertEqual(request(B)[0],503)
                state['raw']=None;self.assertEqual(request(A)[0],503)
                state['raw']=snap(ROUTES,state['clock']);self.assertEqual(request(A),(200,b'project-alpha'))
                self.assertEqual(calls,['project-alpha','project-beta','project-alpha'])
            finally:server.shutdown();thread.join(2)

if __name__=='__main__':unittest.main()
