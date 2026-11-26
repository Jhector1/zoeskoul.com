import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock
import hosted_server_authority as w

class Tests(unittest.TestCase):
    def setUp(self):
        self.allow={'projectIds':['project-one']};self.legacy='legacy-project'
        self.grants={'issuedAtMs':100000,'expiresAtMs':110000,'grants':{'one.sites.zoebuild.test':{'projectId':'project-one'}}}
        self.grant_check=Mock(return_value=self.grants['grants']);self.route_check=Mock();self.ig=Mock();self.ir=Mock()
        self.cfg={'database':'rehearsal','role':'reader','port':5432,'address':None,'psql':'/usr/bin/psql'}
        self.identity={'database':'rehearsal','role':'reader','sessionRole':'reader','port':5432,'address':None,'readOnly':'on','restricted':True,'tablePrivileges':True,'version':180003}
    def publish(self,clock=lambda:100001):
        return w.publish(self.grants,self.allow,self.legacy,self.grant_check,self.route_check,self.ig,self.ir,clock)
    def test_committed_only_and_order(self):
        order=Mock();order.attach_mock(self.ig,'grants');order.attach_mock(self.ir,'routes')
        self.assertEqual(self.publish(),1);self.assertEqual([c[0] for c in order.mock_calls],['grants','routes']);self.assertEqual(self.ir.call_args.args[0],{'issuedAtMs':100000,'expiresAtMs':130000,'routes':{'one.sites.zoebuild.test':'project-one'}})
    def test_empty_revocation(self):
        self.grant_check.return_value={};self.grants['grants']={};self.assertEqual(self.publish(),0);self.assertEqual(self.ir.call_args.args[0]['routes'],{})
    def test_short_budget(self):
        with self.assertRaises(w.AuthorityError):self.publish(lambda:108001)
        self.ig.assert_not_called();self.ir.assert_not_called()
    def test_invalid_grant(self):
        self.grant_check.side_effect=ValueError('bad')
        with self.assertRaises(ValueError):self.publish()
        self.ig.assert_not_called();self.ir.assert_not_called()
    def test_invalid_route(self):
        self.route_check.side_effect=ValueError('bad')
        with self.assertRaises(ValueError):self.publish()
        self.ig.assert_not_called();self.ir.assert_not_called()
    def test_grant_install_failure(self):
        self.ig.side_effect=RuntimeError('write failed')
        with self.assertRaises(RuntimeError):self.publish()
        self.ir.assert_not_called()
    def test_route_install_failure(self):
        self.ir.side_effect=RuntimeError('write failed')
        with self.assertRaises(RuntimeError):self.publish()
        self.ig.assert_called_once()
    def test_database_identity(self):
        w.validate_identity(self.identity,self.cfg)
        for k,v in [('database','other'),('role','owner'),('sessionRole','owner'),('port',5433),('address','127.0.0.1'),('readOnly','off'),('restricted',False),('tablePrivileges',False),('version',160000)]:
            with self.subTest(k=k),self.assertRaises(w.AuthorityError):w.validate_identity({**self.identity,k:v},self.cfg)
    def test_modified_projection(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'query.sql';p.write_text('SELECT 1;');run=Mock()
            with self.assertRaises(w.AuthorityError):w.read_snapshot(Path(d),self.cfg,['project-one'],p,run)
            run.assert_not_called()
    def test_invalid_scope(self):
        for ids in ([],['project-one','project-one'],['x;drop'],['project-one','project-two','project-three']):
            with self.assertRaises(w.AuthorityError):w.read_snapshot(Path('/unused'),self.cfg,ids,Path('/unused'))
    def test_query_contract(self):
        sql=Path(__file__).with_name('hosted_committed_projection.sql')
        run=Mock(return_value=subprocess.CompletedProcess([],0,json.dumps(self.identity)+'\n'+json.dumps(self.grants)+'\n',''))
        self.assertEqual(w.read_snapshot(Path('/private'),self.cfg,['project-one'],sql,run),self.grants)
        kw=run.call_args.kwargs;self.assertIn('REPEATABLE READ READ ONLY',kw['input']);self.assertIn(sql.read_text(),kw['input']);self.assertNotIn('PGPASSWORD',kw['env']);self.assertEqual(kw['timeout'],5)
        run.return_value=subprocess.CompletedProcess([],1,'','private error');self.assertRaises(w.AuthorityError,w.read_snapshot,Path('/private'),self.cfg,['project-one'],sql,run)
    def test_private_config_permissions(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'config.json').write_text(json.dumps({**self.cfg,'mode':'fenced-only-dev','psql':'/bin/sh'}));(p/'pg_service.conf').touch();(p/'pgpass').touch()
            for x in p.iterdir():x.chmod(0o600)
            self.assertEqual(w.load_config(p)['role'],'reader');(p/'pgpass').chmod(0o644)
            with self.assertRaises(w.AuthorityError):w.load_config(p)
if __name__=='__main__':unittest.main()
