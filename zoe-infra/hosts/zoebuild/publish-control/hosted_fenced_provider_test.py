"""Actual fenced files and provider dispatch; Docker operations are test doubles."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import control
import hosted_control
import hosted_gateway
import pilot
from fenced_state import FenceError, NAME
from fenced_state_test import PROJECT, op

CFG={'projectId':PROJECT,'image':'fixture-image','revision':'fixture-revision'}
RAW=b'immutable test bundle'
DIGEST=hashlib.sha256(RAW).hexdigest()

def operation(n=0, name='operation-one', action='publish', version=7):
    o=op(n,name,version,action)
    if o['target']:o['target']['objectSha256']=DIGEST
    return o

def frame(o, raw=RAW):
    return json.dumps(o).encode()+b'\n'+raw

def dispatch(action, raw=b''):
    return hosted_control.dispatch(CFG,action,raw)

class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.rootpatch=patch.object(pilot,'ROOT',self.root);self.rootpatch.start()
        self.addCleanup(self.tmp.cleanup);self.addCleanup(self.rootpatch.stop)
    def test_empty_operator_initialization_and_legacy_exclusion(self):
        self.assertEqual(dispatch('fenced-init'),{'fence':'0','acknowledgement':None})
        with self.assertRaises(Exception):control.pointer(CFG)
        with self.assertRaises(Exception):control.write_pointer(None)
        with self.assertRaises(Exception):dispatch('fenced-init')
        with self.assertRaises(Exception):dispatch('manage',b'{"action":"unpublish","target":null,"expected":null}')
    def test_legacy_root_not_adopted(self):
        control.write_pointer(None)
        with self.assertRaises(FenceError):dispatch('fenced-init')
        self.assertFalse(control.fenced_mode())
        self.assertIsNone(control.pointer(CFG))
    def test_missing_state_does_not_reenable_legacy(self):
        dispatch('fenced-init');(self.root/NAME).unlink()
        self.assertTrue(control.fenced_mode())
        with self.assertRaises(Exception):dispatch('fenced-ack')
        with self.assertRaises(Exception):control.pointer(CFG)
        with self.assertRaises(Exception):dispatch('fenced-init')
    def test_bundle_preparation_and_exact_recovery(self):
        dispatch('fenced-init');o=operation()
        identity={'projectId':PROJECT,'sourceVersion':7,'artifactSha256':'a'*64,'objectSha256':DIGEST}
        def deploy(args):
            self.assertEqual(Path(args.bundle).read_bytes(),RAW)
            self.assertEqual(args.sha,DIGEST);(self.root/DIGEST).mkdir()
        with patch.object(pilot,'validate_bundle',return_value=(identity,{'client/a.js':b'a'})) as validate, patch.object(pilot,'deploy',side_effect=deploy) as staging, patch.object(control,'resolve',return_value=(self.root,'fixture',{})), patch.object(pilot,'smoke') as smoke:
            a=dispatch('fenced-apply',frame(o));self.assertEqual(a['fence'],'1')
            self.assertEqual(dispatch('fenced-ack')['acknowledgement'],a)
            self.assertEqual(dispatch('fenced-apply',frame(o)),a)
            self.assertEqual(staging.call_count,1);self.assertEqual(smoke.call_count,1);self.assertEqual(validate.call_count,1)
        with self.assertRaises(FenceError):dispatch('fenced-apply',frame(operation(name='operation-two')))
        with patch.object(control,'smoke_retained') as smoke:
            a=dispatch('fenced-apply',frame(operation(1,'operation-rollback','rollback',3),b''));self.assertEqual(a['activation']['sourceVersion'],3);smoke.assert_called_once()
        a=dispatch('fenced-apply',frame(operation(2,'operation-stop','unpublish'),b''));self.assertEqual(a['state'],'applied-inactive');self.assertEqual(dispatch('fenced-ack')['fence'],'3')
    def test_bad_frame_and_wrong_bundle_denied(self):
        dispatch('fenced-init')
        for raw in [b'{}',b'{}\n',frame(operation(),b'wrong'),frame(operation(action='unpublish')),frame(operation(action='rollback'))]:
            with self.assertRaises(Exception):dispatch('fenced-apply',raw)
        self.assertEqual(dispatch('fenced-ack')['fence'],'0')
    def test_prepare_failure_no_mutation(self):
        dispatch('fenced-init')
        with patch.object(pilot,'validate_bundle',side_effect=RuntimeError('fixture failure')):
            with self.assertRaises(RuntimeError):dispatch('fenced-apply',frame(operation()))
        self.assertEqual(dispatch('fenced-ack')['fence'],'0')
    def test_gateway_fenced_projects_denied(self):
        parent=self.root/'hosted-publish-dev';parent.mkdir(mode=0o700);project=parent/PROJECT;project.mkdir(mode=0o700)
        with patch.object(pilot,'ROOT',project):dispatch('fenced-init')
        with patch.object(pilot,'ROOT',self.root/'legacy'), patch.object(hosted_gateway,'configured',return_value=({'projectId':'legacy-one'},{'one.sites.zoebuild.test':PROJECT})), patch.object(pilot,'safe_path',return_value=True),patch.object(pilot,'fetch') as fetch:
            self.assertIsNone(hosted_gateway.worker('one.sites.zoebuild.test',PROJECT,'GET','/',True));fetch.assert_not_called()
    def test_gateway_discards_changed_legacy_release(self):
        parent=self.root/'hosted-publish-dev';parent.mkdir(mode=0o700);project=parent/PROJECT;project.mkdir(mode=0o700)
        a={'projectId':PROJECT,'sourceVersion':7,'artifactSha256':'a'*64,'objectSha256':'b'*64,'activatedAt':'test'}
        with patch.object(pilot,'ROOT',self.root/'legacy'),patch.object(hosted_gateway,'configured',return_value=({'projectId':'legacy-one'},{'one.sites.zoebuild.test':PROJECT})),patch.object(pilot,'safe_path',return_value=True),patch.object(control,'pointer',side_effect=[a,None]),patch.object(control,'resolve',return_value=(project,'fixture',{})),patch.object(pilot,'fetch',return_value=(200,'text/html','',b'old')):
            self.assertIsNone(hosted_gateway.worker('one.sites.zoebuild.test',PROJECT,'GET','/',True))

if __name__=='__main__':unittest.main()
