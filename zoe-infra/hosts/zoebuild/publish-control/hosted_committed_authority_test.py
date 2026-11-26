import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import control, hosted_gateway, hosted_committed_authority as a, hosted_fenced_provider as f, pilot
from fenced_state_test import PROJECT, op
from fenced_state import FenceError

HOST='one.sites.zoebuild.test'
CFG={'projectId':PROJECT}
ALLOW={'projectIds':[PROJECT]}
class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.project=self.root/'hosted-publish-dev'/PROJECT;self.project.mkdir(parents=True,mode=0o700)
        self.project.parent.chmod(0o700)
        with patch.object(pilot,'ROOT',self.project):
            f.initialize(CFG);s=f.checked_runtime(CFG);s.apply(op(),lambda x:x);self.state=s.read()
        intent=self.state['intent'];self.grant={**self.state['activation'],'fence':self.state['fence'],'operationId':intent['operationId'],'deploymentId':intent['target']['deploymentId']}
        self.snapshot={'issuedAtMs':1000,'expiresAtMs':11000,'grants':{HOST:self.grant}}
    def test_valid_exact_state(self):
        self.assertEqual(a.validate(self.snapshot,ALLOW,'legacy-one',1001),{HOST:self.grant});self.assertTrue(a.match_runtime(self.grant,self.state))
    def test_expiry_future_scope(self):
        for now in (11000,-1001):
            with self.assertRaises(FenceError):a.validate(self.snapshot,ALLOW,'legacy-one',now)
        with self.assertRaises(FenceError):a.validate(self.snapshot,ALLOW,PROJECT,1001)
    def test_wrong_identity(self):
        for k,v in [('fence','2'),('operationId','operation-other'),('deploymentId','release-other'),('sourceVersion',999),('artifactHash','c'*64),('objectSha256','d'*64),('activatedAt','2026-11-25T01:02:03.123456+00:00')]:
            self.assertFalse(a.match_runtime({**self.grant,k:v},self.state),k)
    def test_inactive_never_serves(self):
        self.assertFalse(a.match_runtime(self.grant,{'activation':None,'intent':None,'fence':'0'}))
    def test_grant_install_and_replay(self):
        with patch.object(a,'GRANTS',self.root/'grants.json'),patch.object(a,'now_ms',return_value=1001),patch.object(control,'configuration',return_value={'projectId':'legacy-one'}),patch.object(control,'read_private',side_effect=lambda p: ALLOW if p!=a.GRANTS else self.snapshot):
            a.install(self.snapshot)
            self.assertEqual(a.selected(HOST,PROJECT,CFG),self.grant)
            with self.assertRaises(FenceError):a.install(self.snapshot)
    def test_worker_checks_before_and_after(self):
        for grants,allowed in [([None],False),([self.grant]*4,True),([self.grant,self.grant,None],False)]:
            with patch.object(pilot,'ROOT',self.root/'legacy'),patch.object(hosted_gateway,'configured',return_value=({'projectId':'legacy-one'},{HOST:PROJECT})),patch.object(a,'selected',side_effect=grants),patch.object(control,'resolve',return_value=(self.project,'fixture',{})),patch.object(pilot,'fetch',return_value=(200,'text/html','',b'ok')) as fetch:
                got=hosted_gateway.worker(HOST,PROJECT,'GET','/',True);self.assertEqual(got is not None,allowed)
                if grants[0] is None:fetch.assert_not_called()
    def test_static_map_never_serves(self):
        with patch.object(pilot,'ROOT',self.root/'legacy'),patch.object(hosted_gateway,'configured',return_value=({'projectId':'legacy-one'},{HOST:PROJECT})),patch.object(a,'selected') as read,patch.object(pilot,'fetch') as fetch:
            self.assertIsNone(hosted_gateway.worker(HOST,PROJECT,'GET','/',False));read.assert_not_called();fetch.assert_not_called()
    def test_runtime_changes_during_fetch(self):
        def fetch(*args):
            s=f.checked_runtime(CFG);s.apply(op(1,'operation-stop',action='unpublish'),lambda x:x);return (200,'text/html','',b'old')
        with patch.object(pilot,'ROOT',self.root/'legacy'),patch.object(hosted_gateway,'configured',return_value=({'projectId':'legacy-one'},{HOST:PROJECT})),patch.object(a,'selected',return_value=self.grant),patch.object(control,'resolve',return_value=(self.project,'fixture',{})),patch.object(pilot,'fetch',side_effect=fetch):
            self.assertIsNone(hosted_gateway.worker(HOST,PROJECT,'GET','/',True))
    def test_atomic_read_while_prepare_lock_held(self):
        from fenced_state import FencedState
        with FencedState(self.project,PROJECT).locked():
            self.assertEqual(a.read_runtime(self.project,PROJECT),self.state)
    def test_parent_guard_drops_changed_response(self):
        import threading,http.client
        with hosted_gateway.Gateway(('127.0.0.1',0),{HOST:PROJECT},fetch=lambda *args:(200,'text/html','',b'old'),guard=lambda *args:next(guards)) as server:
            guards=iter([('fenced',self.grant),('fenced',{**self.grant,'fence':'2'})])
            t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
            try:
                conn=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                conn.request('GET','/',headers={'Host':HOST});response=conn.getresponse();self.assertEqual(response.status,404);self.assertNotEqual(response.read(),b'old');conn.close()
            finally:server.shutdown();t.join(timeout=3)
if __name__=='__main__':unittest.main()
