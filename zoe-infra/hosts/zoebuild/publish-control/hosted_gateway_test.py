"""Local HTTP and request-worker tests, no real Docker or database writes."""
import http.client
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import hosted_gateway as g
import pilot
import control

A = 'alpha.sites.zoebuild.test'
B = 'beta.sites.zoebuild.test'
ROUTES = {A:'project-alpha', B:'project-beta'}
ALLOW = {'projectIds': list(ROUTES.values())}


class PolicyTests(unittest.TestCase):
    def test_exact_host(self):
        self.assertEqual(g.host_name([A.upper()+':33108'],33108),A)
        for values in ([],[A,B],[A+':80'],[A+'.'],['x.'+A],['user@'+A],[A+', '+B],['127.0.0.1'],[A+' '],['K.sites.zoebuild.test']):
            with self.subTest(values=values), self.assertRaises(ValueError): g.host_name(values,33108)

    def test_route_map(self):
        self.assertEqual(g.route_map({'routes':ROUTES},ALLOW,'legacy'),ROUTES)
        for raw in ({'routes':{A:'legacy'}},{'routes':{A:'unknown'}},{'routes':{A:'project-alpha',B:'project-alpha'}},{'routes':{'example.com':'project-alpha'}},{'routes':ROUTES,'extra':1}):
            with self.assertRaises(ValueError):g.route_map(raw,ALLOW,'legacy')
        with self.assertRaises(ValueError):g.route_map({'routes':ROUTES},{'projectIds':['legacy','project-alpha']},'legacy')

    def test_worker_response(self):
        self.assertIsNone(g.decode(g.encode(None)))
        r=(200,'text/html','',b'hello')
        self.assertEqual(g.decode(g.encode(r)),r)
        for r in ((101,'text/plain','',b''),(200,'x\r\ny','',b''),(302,'text/plain','https://evil.test',b'')):
            with self.assertRaises(ValueError):g.decode(g.encode(r))

    def test_symlink_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); (p/'link').symlink_to(p)
            with self.assertRaises(ValueError):g.private_existing(p/'link')

    def test_worker_uses_exact_project_and_active_release(self):
        with tempfile.TemporaryDirectory() as tmp:
            legacy=Path(tmp)/'legacy';legacy.mkdir(mode=0o700)
            parent=Path(tmp)/'hosted-publish-dev';parent.mkdir(mode=0o700)
            target=parent/'project-alpha';target.mkdir(mode=0o700)
            cfg={'projectId':'legacy'}
            with patch.object(pilot,'ROOT',legacy), patch.object(g,'configured',return_value=(cfg,ROUTES)), patch.object(control,'pointer',return_value={'objectSha256':'fixture'}) as pointer, patch.object(control,'resolve',return_value=(['docker'],'container-a',{})) as resolve, patch.object(pilot,'fetch',return_value=(200,'text/plain','',b'alpha')) as fetch:
                self.assertEqual(g.worker(A,'project-alpha','GET','/')[3],b'alpha')
                self.assertEqual(pilot.ROOT,target)
                self.assertEqual(pointer.call_args.args[0]['projectId'],'project-alpha')
                resolve.assert_called_once();fetch.assert_called_once_with(['docker'],'container-a','/','GET')

    def test_worker_unpublished_does_not_resolve(self):
        with tempfile.TemporaryDirectory() as tmp:
            legacy=Path(tmp)/'legacy';legacy.mkdir(mode=0o700)
            parent=Path(tmp)/'hosted-publish-dev';parent.mkdir(mode=0o700)
            (parent/'project-alpha').mkdir(mode=0o700)
            with patch.object(pilot,'ROOT',legacy), patch.object(g,'configured',return_value=({'projectId':'legacy'},ROUTES)), patch.object(control,'pointer',return_value=None), patch.object(control,'resolve') as resolve:
                self.assertIsNone(g.worker(A,'project-alpha','GET','/'))
                resolve.assert_not_called()

    def test_worker_rejects_changed_route(self):
        with patch.object(g,'configured',return_value=({'projectId':'legacy'},ROUTES)), patch.object(control,'pointer') as pointer:
            with self.assertRaises(ValueError):g.worker(A,'project-beta','GET','/')
            pointer.assert_not_called()


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.active={'project-alpha':b'alpha-v1','project-beta':b'beta-v1'}
        self.calls=[]
        def fetch(host,project,method,path):
            self.calls.append((host,project,method,path))
            if path=='/error':raise RuntimeError('internal secret')
            if self.active[project] is None:return None
            return 200,'text/plain','',self.active[project] if method=='GET' else b''
        self.server=g.Gateway(('127.0.0.1',0),ROUTES,fetch)
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':0.01},daemon=True);self.thread.start()
        self.addCleanup(self.close)

    def close(self):
        self.server.shutdown();self.thread.join(2);self.server.server_close()

    def request(self,host=A,path='/',method='GET',headers=()):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        try:
            c.putrequest(method,path,skip_host=True)
            if host is not None:c.putheader('Host',host)
            for k,v in headers:c.putheader(k,v)
            c.endheaders();r=c.getresponse();return r.status,r.read()
        finally:c.close()

    def test_independent_routes(self):
        self.assertEqual(self.request(A),(200,b'alpha-v1'))
        self.assertEqual(self.request(B),(200,b'beta-v1'))
        self.active['project-alpha']=b'alpha-v2'
        self.assertEqual(self.request(A),(200,b'alpha-v2'))
        self.assertEqual(self.request(B),(200,b'beta-v1'))
        self.active['project-alpha']=None
        self.assertEqual(self.request(A)[0],404)
        self.assertEqual(self.request(B),(200,b'beta-v1'))

    def test_concurrent_routes(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            for _ in range(5):
                a=pool.submit(self.request,A);b=pool.submit(self.request,B)
                self.assertEqual(a.result(),(200,b'alpha-v1'))
                self.assertEqual(b.result(),(200,b'beta-v1'))

    def test_unknown_no_fallback(self):
        self.assertEqual(self.request('unknown.sites.zoebuild.test')[0],404)
        self.assertEqual(self.calls,[])

    def test_duplicate_missing_wrong_host(self):
        for host,headers in ((None,()),(A,(('Host',B),)),('example.com',())):
            self.assertEqual(self.request(host,headers=headers)[0],400)
        self.assertEqual(self.calls,[])

    def test_forwarded_headers_ignored(self):
        self.assertEqual(self.request(A,headers=(('X-Forwarded-Host',B),('Cookie','secret'),('Authorization','secret'))),(200,b'alpha-v1'))
        self.assertEqual(self.calls,[(A,'project-alpha','GET','/')])

    def test_unsupported_requests(self):
        for path,method,headers,code in (('//evil.test','GET',(),400),('http://evil.test/','GET',(),400),('/','POST',(),405),('/','GET',(('Content-Length','1'),),400),('/','GET',(('Transfer-Encoding','chunked'),),400)):
            self.assertEqual(self.request(A,path,method,headers)[0],code)
        self.assertEqual(self.calls,[])

    def test_head(self):
        self.assertEqual(self.request(B,method='HEAD'),(200,b''))
        self.assertEqual(self.calls,[(B,'project-beta','HEAD','/')])

    def test_error_is_closed(self):
        status,body=self.request(A,'/error')
        self.assertEqual(status,502);self.assertNotIn(b'internal secret',body)
        self.assertEqual(self.request(B),(200,b'beta-v1'))


if __name__=='__main__':unittest.main()
