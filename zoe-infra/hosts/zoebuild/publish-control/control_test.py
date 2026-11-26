import json
import http.client
import http.server
import threading
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import control
import pilot


class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.addCleanup(lambda:[p.chmod(0o700) for p in Path(self.tmp.name).rglob("*") if p.is_dir()])
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
        identity,files=pilot.validate_bundle(Path(args.bundle).read_bytes(),args.sha)
        (self.root/args.sha).mkdir();self.created.append(args.sha)
        self.receipts[args.sha]={**identity,"image":args.image,"revision":args.revision,"container":pilot.deployment_name(args.sha)}
        receipt=self.root/args.sha/"receipt.json"
        receipt.write_text(json.dumps(self.receipts[args.sha]));receipt.chmod(0o600)
        pilot.materialize(self.root/args.sha/"dist",files)
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

    def request(self,action,target,expected):
        return {"action":action,"target":target,"expected":None if expected is None else {k:expected[k] for k in ("objectSha256","activatedAt")}}
    def test_history_and_restore(self):
        a=control.activate(self.cfg,self.bundle());b=control.activate(self.cfg,self.bundle(2))
        self.assertEqual([r["sourceVersion"] for r in control.history(self.cfg)["releases"]],[2,1])
        state=control.manage(self.cfg,self.request("restore",a["objectSha256"],b))
        self.assertEqual(state["active"]["sourceVersion"],1);self.assertEqual(len(self.created),2)
        self.assertEqual(control.status(self.cfg),state["active"])
        self.assertEqual(self.smoke.call_args.args[2]["client/assets/app.css"],b"body{color:green}")
    def test_unpublish_and_restore_retained(self):
        a=control.activate(self.cfg,self.bundle());state=control.manage(self.cfg,self.request("unpublish",None,a))
        self.assertIsNone(state["active"]);self.assertIsNone(control.status(self.cfg));self.assertEqual(len(state["releases"]),1)
        self.assertEqual(control.active_path().read_text().strip(),"null")
        b=control.manage(self.cfg,self.request("restore",a["objectSha256"],None))["active"]
        self.assertEqual(b["objectSha256"],a["objectSha256"]);self.assertEqual(len(self.created),1)
    def test_stale_management_rejected(self):
        a=control.activate(self.cfg,self.bundle());b=control.activate(self.cfg,self.bundle(2))
        with self.assertRaises(ValueError):control.manage(self.cfg,self.request("unpublish",None,a))
        with self.assertRaises(ValueError):control.manage(self.cfg,self.request("restore","c"*64,b))
        self.assertEqual(control.pointer(self.cfg),b)
    def test_restore_failure_keeps_active(self):
        a=control.activate(self.cfg,self.bundle());b=control.activate(self.cfg,self.bundle(2))
        self.smoke.side_effect=RuntimeError("not healthy")
        with self.assertRaises(RuntimeError):control.manage(self.cfg,self.request("restore",a["objectSha256"],b))
        self.assertEqual(control.pointer(self.cfg),b)
    def test_management_lock(self):
        a=control.activate(self.cfg,self.bundle())
        with control.activation_lock():
            with self.assertRaises(RuntimeError):control.manage(self.cfg,self.request("unpublish",None,a))
    def test_other_project_receipt_not_selectable(self):
        a=control.activate(self.cfg,self.bundle())
        foreign=self.root/("f"*64);foreign.mkdir();r=foreign/"receipt.json"
        r.write_text(json.dumps({"projectId":"other-project"}));r.chmod(0o600)
        self.assertEqual(len(control.history(self.cfg)["releases"]),1)
        with self.assertRaises(ValueError):control.manage(self.cfg,self.request("restore","f"*64,a))
    def test_unpublish_then_normal_publish(self):
        a=control.activate(self.cfg,self.bundle());control.manage(self.cfg,self.request("unpublish",None,a))
        b=control.activate(self.cfg,self.bundle(2));self.assertEqual(control.status(self.cfg),b)
    def test_gateway_restart_while_unpublished_and_restore(self):
        a=control.activate(self.cfg,self.bundle());control.manage(self.cfg,self.request("unpublish",None,a))
        # Exercise the actual HTTP handler on an ephemeral loopback port.
        original=http.server.ThreadingHTTPServer
        started=threading.Event();servers=[]
        class LocalServer(original):
            def __init__(self,address,handler):
                super().__init__(("127.0.0.1",0),handler);servers.append(self);started.set()
        def selected():
            active=control.pointer(self.cfg)
            return None if active is None else control.resolve(self.cfg,active)
        with patch.object(pilot.http.server,"ThreadingHTTPServer",LocalServer):
            thread=threading.Thread(target=pilot.serve_gateway,args=(selected,),kwargs={"allow_unpublished":True},daemon=True);thread.start()
            self.assertTrue(started.wait(3))
            server=servers[0]
            try:
                def get(method="GET"):
                    conn=http.client.HTTPConnection("127.0.0.1",server.server_port,timeout=3)
                    try:
                        conn.request(method,"/",headers={"Host":f"127.0.0.1:{pilot.PORT}"});resp=conn.getresponse();resp.read();return resp.status
                    finally:conn.close()
                self.assertEqual(get(),404);self.assertEqual(get("HEAD"),404)
                control.manage(self.cfg,self.request("restore",a["objectSha256"],None))
                self.assertEqual(get(),200)
            finally:server.shutdown();thread.join(3)
    def test_bad_receipt_blocks_management(self):
        a=control.activate(self.cfg,self.bundle());r=self.root/a["objectSha256"]/"receipt.json";r.chmod(0o644)
        with self.assertRaises(ValueError):control.history(self.cfg)
        self.assertEqual(control.pointer(self.cfg),a)

if __name__=="__main__":unittest.main(verbosity=2)
