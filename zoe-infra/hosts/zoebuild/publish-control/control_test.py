import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import control
import pilot


class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.cfg={"projectId":"pilot-fixture","image":"ghcr.io/jhector1/zoeskoul-publish-pilot@sha256:"+"a"*64,"revision":"b"*40}
        self.receipts={};self.created=[]
        self.start_patch(patch.object(pilot,"ROOT",self.root))
        self.start_patch(patch.object(pilot,"deploy",side_effect=self.deploy))
        self.start_patch(patch.object(pilot,"load_deployment",side_effect=self.load))
        self.smoke=self.start_patch(patch.object(pilot,"smoke"))
        self.start_patch(patch.object(pilot,"fetch",return_value=(200,"text/html","",b"<html><body>ready</body></html>")))
    def start_patch(self,patcher):
        value=patcher.start();self.addCleanup(patcher.stop);return value
    def deploy(self,args):
        identity,_=pilot.validate_bundle(Path(args.bundle).read_bytes(),args.sha)
        (self.root/args.sha).mkdir();self.created.append(args.sha)
        self.receipts[args.sha]={**identity,"image":args.image,"revision":args.revision}
    def load(self,digest):
        return ["docker"],digest,self.receipts[digest]
    def bundle(self,version=1,project="pilot-fixture"):
        raw,_=pilot.fixture();b=json.loads(raw);b["sourceVersion"]=version;b["buildProjectId"]=project
        return json.dumps(b).encode()
    def test_activate_and_status(self):
        self.assertIsNone(control.status(self.cfg));a=control.activate(self.cfg,self.bundle())
        self.assertEqual(control.status(self.cfg),a);self.assertEqual(a["sourceVersion"],1)
        self.assertEqual(control.active_path().stat().st_mode&0o777,0o600)
    def test_unchanged_reuses_receipt(self):
        raw=self.bundle();a=control.activate(self.cfg,raw);b=control.activate(self.cfg,raw)
        self.assertEqual(a,b);self.assertEqual(len(self.created),1)
    def test_new_release_keeps_old_until_verified(self):
        a=control.activate(self.cfg,self.bundle());self.smoke.side_effect=lambda *_:self.assertEqual(control.pointer(self.cfg),a)
        b=control.activate(self.cfg,self.bundle(2));self.assertEqual(b["sourceVersion"],2)
        self.assertEqual(control.status(self.cfg),b);self.assertTrue((self.root/a["objectSha256"]).exists())
    def test_failed_smoke_keeps_old(self):
        a=control.activate(self.cfg,self.bundle());self.smoke.side_effect=RuntimeError("failure")
        with self.assertRaises(RuntimeError):control.activate(self.cfg,self.bundle(2))
        self.assertEqual(control.pointer(self.cfg),a)
    def test_wrong_project_and_older_release_denied(self):
        with self.assertRaises(ValueError):control.activate(self.cfg,self.bundle(project="other-project"))
        a=control.activate(self.cfg,self.bundle(2))
        with self.assertRaises(ValueError):control.activate(self.cfg,self.bundle(1))
        self.assertEqual(control.pointer(self.cfg),a);self.assertEqual(len(self.created),1)
    def test_exact_runtime_and_receipt_required(self):
        a=control.activate(self.cfg,self.bundle());self.receipts[a["objectSha256"]]["revision"]="c"*40
        with self.assertRaises(ValueError):control.status(self.cfg)
    def test_release_limit(self):
        for i in range(5):control.activate(self.cfg,self.bundle(i+1))
        with self.assertRaises(ValueError):control.activate(self.cfg,self.bundle(6))
        self.assertEqual(control.status(self.cfg)["sourceVersion"],5)
    def test_parallel_activation_lock(self):
        with control.activation_lock():
            with self.assertRaises(RuntimeError):control.activate(self.cfg,self.bundle())
    def test_reject_symlink_pointer(self):
        control.active_path().symlink_to(self.root/"missing")
        with self.assertRaises(OSError):control.pointer(self.cfg)

if __name__=="__main__":unittest.main(verbosity=2)
