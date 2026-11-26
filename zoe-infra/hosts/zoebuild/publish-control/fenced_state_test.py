import json
import multiprocessing
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fenced_state import FencedState, FenceError, NAME, MAX, ack

PROJECT = 'project-one'

def op(n=0, name='operation-one', version=7, action='publish', project=PROJECT):
    return {'operationId': name, 'projectId': project, 'expectedGeneration': str(n), 'action': action,
            'target': None if action == 'unpublish' else {'deploymentId': 'release-one', 'sourceVersion': version,
                                                         'artifactHash': 'a'*64, 'objectSha256': 'b'*64}}

def prepare(identity):
    return identity

def competing(root, name, start, results):
    start.wait(5)
    try:
        results.put(FencedState(root, PROJECT).apply(op(name=name), prepare)['operationId'])
    except FenceError as e:
        results.put(str(e))

def crashing(root, after_replace):
    import fenced_state
    original = os.replace
    def crash(*args, **kwargs):
        if after_replace:
            original(*args, **kwargs)
        os._exit(77)
    fenced_state.os.replace = crash
    FencedState(root, PROJECT).apply(op(), prepare)

class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.s = FencedState(self.root, PROJECT)
        self.s.initialize_empty()
    def tearDown(self):
        self.tmp.cleanup()
    def test_initial(self):
        self.assertEqual(self.s.read()['fence'], '0')
        self.assertIsNone(ack(self.s.read()))
    def test_publish_and_reopen_replay(self):
        r = self.s.apply(op(), prepare)
        other = FencedState(self.root, PROJECT)
        self.assertEqual(r, ack(other.read()))
        self.assertEqual(r, other.apply(op(), lambda _: self.fail('replayed prepare')))
        self.assertEqual(r['fence'], '1')
        self.assertRegex(r['activation']['activatedAt'], r'\.\d{6}\+00:00$')
    def test_conflicting_replay(self):
        self.s.apply(op(), prepare)
        with self.assertRaisesRegex(FenceError, 'OPERATION_ID_REUSED'):
            self.s.apply(op(version=8), prepare)
    def test_stale_future_cross_project(self):
        self.s.apply(op(), prepare)
        for o in (op(name='operation-two'), op(n=2,name='operation-two'), op(n=1,project='project-two')):
            with self.assertRaises(FenceError): self.s.apply(o, lambda _: self.fail('prepare'))
    def test_explicit_rollback_unpublish(self):
        self.s.apply(op(), prepare)
        with self.assertRaisesRegex(FenceError, 'ROLLBACK_REQUIRES'):
            self.s.apply(op(1,'operation-two',3), prepare)
        self.s.apply(op(1,'operation-two',3,'rollback'), prepare)
        r = self.s.apply(op(2,'operation-three',action='unpublish'), lambda _: self.fail('prepare'))
        self.assertEqual(r, {'projectId':PROJECT,'operationId':'operation-three','fence':'3','state':'applied-inactive'})
        self.assertIsNone(self.s.read()['activation'])
        self.assertEqual(r, self.s.apply(op(2,'operation-three',action='unpublish'), prepare))
        with self.assertRaises(FenceError): self.s.apply(op(),prepare)
    def test_prepare_failure_preserves_state(self):
        self.s.apply(op(), prepare)
        before=self.s.read()
        with self.assertRaisesRegex(RuntimeError,'staging failed'):
            self.s.apply(op(1,'operation-two'), lambda _: (_ for _ in ()).throw(RuntimeError('staging failed')))
        self.assertEqual(before,self.s.read())
    def test_wrong_prepared_identity(self):
        with self.assertRaisesRegex(FenceError,'PREPARED_IDENTITY_MISMATCH'):
            self.s.apply(op(),lambda x:{**x,'sourceVersion':8})
        self.assertEqual(self.s.read()['fence'],'0')
    def test_failure_before_replace(self):
        with patch('fenced_state.os.replace',side_effect=OSError('injected')):
            with self.assertRaises(OSError): self.s.apply(op(),prepare)
        self.assertEqual(self.s.read()['fence'],'0')
        self.assertEqual(self.s.apply(op(),prepare)['fence'],'1')
    def test_lost_response_after_replace(self):
        real=os.fsync
        def fail_directory(fd):
            import stat
            if stat.S_ISDIR(os.fstat(fd).st_mode): raise OSError('injected')
            return real(fd)
        with patch('fenced_state.os.fsync',side_effect=fail_directory):
            with self.assertRaises(OSError): self.s.apply(op(),prepare)
        reopened=FencedState(self.root,PROJECT)
        self.assertEqual(reopened.apply(op(),lambda _:self.fail('prepare')),ack(reopened.read()))
    def test_process_death_before_replace(self):
        self.crash_at_replace(False)
        self.assertEqual(self.s.read()['fence'], '0')
        self.assertEqual(self.s.apply(op(),prepare)['fence'], '1')
    def test_process_death_after_replace(self):
        self.crash_at_replace(True)
        state=self.s.read()
        self.assertEqual(state['fence'],'1')
        self.assertEqual(self.s.apply(op(),lambda _:self.fail('prepare')),ack(state))
    def crash_at_replace(self, after_replace):
        ctx=multiprocessing.get_context('spawn')
        p=ctx.Process(target=crashing,args=(str(self.root),after_replace))
        p.start();p.join(10)
        if p.is_alive():p.terminate();p.join();self.fail('process timeout')
        self.assertEqual(p.exitcode,77)
    def test_real_concurrent_processes(self):
        ctx=multiprocessing.get_context('spawn')
        start=ctx.Event(); q=ctx.Queue()
        ps=[ctx.Process(target=competing,args=(str(self.root),name,start,q)) for name in ('operation-one','operation-two')]
        for p in ps:p.start()
        try:
            start.set(); results=[q.get(timeout=10) for _ in ps]
            self.assertIn('STALE_OR_FUTURE_FENCE',results)
            self.assertIn(self.s.read()['intent']['operationId'],results)
            self.assertEqual(self.s.read()['fence'],'1')
        finally:
            for p in ps:
                p.join(3)
                if p.is_alive():p.terminate();p.join()
            q.close();q.join_thread()
    def test_missing_state_not_adopted(self):
        (self.root/NAME).unlink()
        with self.assertRaises(FileNotFoundError):self.s.apply(op(),prepare)
        (self.root/'active-private.json').write_text('null')
        with self.assertRaisesRegex(FenceError,'NONEMPTY_ROOT'):self.s.initialize_empty()
    def test_corrupt_state_denied(self):
        (self.root/NAME).write_text('{"version":1,"version":1}')
        with self.assertRaisesRegex(FenceError,'DUPLICATE_JSON_KEY'):self.s.read()
    def test_unsafe_files_denied(self):
        p=self.root/NAME;p.chmod(0o644)
        with self.assertRaisesRegex(FenceError,'UNSAFE_FILE'):self.s.read()
        p.unlink();p.symlink_to('/dev/null')
        with self.assertRaises(OSError):self.s.read()
    def test_bigint_and_invalid_wire(self):
        for value in (0,'00','-1',str(MAX),'9223372036854775808',True):
            bad=op();bad['expectedGeneration']=value
            with self.assertRaises(FenceError): self.s.apply(bad,prepare)
        state={'version':1,'projectId':PROJECT,'fence':str(MAX-1),'intent':op(MAX-2,action='unpublish'),'activation':None}
        (self.root/NAME).write_text(json.dumps(state))
        self.assertEqual(self.s.apply(op(MAX-1,'operation-final',action='unpublish'),prepare)['fence'],str(MAX))
    def test_root_scope_and_existing_initialization(self):
        with self.assertRaisesRegex(FenceError,'NONEMPTY_ROOT'):self.s.initialize_empty()
        with self.assertRaises(FenceError):FencedState(self.root,'project-two').read()
        self.root.chmod(0o755)
        try:
            with self.assertRaisesRegex(FenceError,'UNSAFE_ROOT'):self.s.read()
        finally:self.root.chmod(0o700)

if __name__=='__main__':unittest.main()
