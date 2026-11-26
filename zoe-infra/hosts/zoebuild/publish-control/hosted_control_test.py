"""Local fixture tests. No Docker, SSH, DNS, or deployment side effects."""
import contextlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import control
import hosted_control as hosted
import pilot


class HostedTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.base = Path(tmp.name)
        self.addCleanup(lambda: [p.chmod(0o700) for p in self.base.rglob('*') if p.is_dir() and not p.is_symlink()])
        self.legacy = self.base / 'publish-pilot'
        self.legacy.mkdir(mode=0o700)
        self.sentinel = self.legacy / 'active-private.json'
        self.sentinel.write_bytes(b'legacy-untouched')
        self.cfg = {'projectId': 'legacy-project', 'image': 'ghcr.io/jhector1/zoeskoul-publish-pilot@sha256:'+'a'*64, 'revision':'b'*40}
        self.allow = {'projectIds': ['project-alpha', 'project-beta']}
        self.receipts = {}
        self.start(patch.object(pilot, 'deploy', side_effect=self.deploy))
        self.start(patch.object(pilot, 'load_deployment', side_effect=self.load))
        self.smoke = self.start(patch.object(pilot, 'smoke'))
        self.start(patch.object(pilot, 'fetch', return_value=(200,'text/html','',b'<html><body>ok</body></html>')))

    def start(self, p):
        value = p.start(); self.addCleanup(p.stop); return value

    def deploy(self, args):
        identity, files = pilot.validate_bundle(Path(args.bundle).read_bytes(), args.sha)
        directory = pilot.ROOT / args.sha
        directory.mkdir(mode=0o700)
        receipt = {**identity, 'image':args.image, 'revision':args.revision, 'container':pilot.deployment_name(args.sha)}
        self.receipts[(pilot.ROOT,args.sha)] = receipt
        path = directory / 'receipt.json'
        path.write_text(json.dumps(receipt)); path.chmod(0o600)
        pilot.materialize(directory / 'dist', files)

    def load(self, digest):
        return ['mock-docker'], digest, self.receipts[(pilot.ROOT,digest)]

    def bundle(self, project, version=1):
        raw,_ = pilot.fixture(); value = json.loads(raw)
        value['buildProjectId'] = project; value['sourceVersion'] = version
        return json.dumps(value).encode()

    @contextlib.contextmanager
    def scoped(self, project):
        cfg, root = hosted.select_project(project, self.cfg, self.allow, self.legacy)
        # Sequential fixture calls simulate separate one-shot CLI invocations.
        with patch.object(pilot, 'ROOT', root):
            yield cfg, root

    def op(self, project, op, raw=b''):
        with self.scoped(project) as (cfg, _):
            return hosted.dispatch(cfg, op, raw)

    def activate(self, project, version=1):
        return self.op(project, 'activate', self.bundle(project, version))

    def mutate(self, project, action, target, expected):
        return self.op(project, 'manage', json.dumps({'action':action,'target':target,'expected':None if expected is None else {k:expected[k] for k in ('objectSha256','activatedAt')}}).encode())

    def test_independent_active_and_history(self):
        a=self.activate('project-alpha'); b=self.activate('project-beta',3)
        self.assertNotEqual(a['objectSha256'],b['objectSha256'])
        self.assertEqual(self.op('project-alpha','status'),a)
        self.assertEqual(self.op('project-beta','history')['active'],b)
        self.assertEqual(len(self.op('project-alpha','history')['releases']),1)
        self.assertEqual(self.sentinel.read_bytes(),b'legacy-untouched')

    def test_rollback_and_unpublish_do_not_affect_other_project(self):
        a=self.activate('project-alpha'); newer=self.activate('project-alpha',2); b=self.activate('project-beta')
        restored=self.mutate('project-alpha','restore',a['objectSha256'],newer)['active']
        self.assertEqual(restored['sourceVersion'],1)
        self.assertIsNone(self.mutate('project-alpha','unpublish',None,restored)['active'])
        self.assertEqual(self.op('project-beta','status'),b)
        self.assertEqual(len(self.op('project-alpha','history')['releases']),2)
        self.assertEqual(self.mutate('project-alpha','restore',a['objectSha256'],None)['active']['objectSha256'],a['objectSha256'])

    def test_cross_project_bundle_denied(self):
        with self.assertRaises(ValueError): self.op('project-alpha','activate',self.bundle('project-beta'))
        self.assertEqual(self.op('project-alpha','history'),{'active':None,'releases':[]})

    def test_cross_project_restore_denied(self):
        a=self.activate('project-alpha'); b=self.activate('project-beta')
        with self.assertRaises(ValueError): self.mutate('project-alpha','restore',b['objectSha256'],a)
        self.assertEqual(self.op('project-alpha','status'),a)

    def test_per_project_capacity(self):
        for v in range(1,6): self.activate('project-alpha',v)
        with self.assertRaises(ValueError): self.activate('project-alpha',6)
        b=self.activate('project-beta',6)
        self.assertEqual(self.op('project-beta','status'),b)

    def test_failed_smoke_preserves_pointer(self):
        a=self.activate('project-alpha'); b=self.activate('project-beta')
        self.smoke.side_effect=RuntimeError('failed')
        with self.assertRaises(RuntimeError): self.activate('project-alpha',2)
        self.assertEqual(self.op('project-alpha','status'),a)
        self.assertEqual(self.op('project-beta','status'),b)

    def test_stale_mutation_rejected(self):
        a=self.activate('project-alpha'); newer=self.activate('project-alpha',2)
        with self.assertRaises(ValueError): self.mutate('project-alpha','unpublish',None,a)
        self.assertEqual(self.op('project-alpha','status'),newer)

    def test_project_locks_independent(self):
        with self.scoped('project-alpha'):
            with control.activation_lock():
                with self.assertRaises(RuntimeError): self.op('project-alpha','history')
                self.assertEqual(self.op('project-beta','history')['releases'],[])

    def test_allowlist_denials_before_storage(self):
        for project, ids in [('unknown-project', self.allow['projectIds']),('legacy-project',['legacy-project']),('../escape',self.allow['projectIds']),('project-alpha',['project-alpha']*2),('project-alpha',['project-alpha','project-beta','project-gamma'])]:
            with self.subTest(project=project,ids=ids),self.assertRaises(ValueError):
                hosted.select_project(project,self.cfg,{'projectIds':ids},self.legacy)
        self.assertFalse((self.base/'hosted-publish-dev').exists())

    def test_allowlist_rotation_fails_closed(self):
        self.activate('project-alpha')
        self.allow={'projectIds':['project-beta','project-gamma']}
        with self.assertRaises(ValueError): self.op('project-beta','history')

    def test_parent_symlink_rejected(self):
        (self.base/'hosted-publish-dev').symlink_to(self.legacy, target_is_directory=True)
        with self.assertRaises(ValueError): self.op('project-alpha','history')
        self.assertEqual(self.sentinel.read_bytes(),b'legacy-untouched')

    def test_project_symlink_rejected(self):
        parent=self.base/'hosted-publish-dev';parent.mkdir(mode=0o700)
        (parent/'project-alpha').symlink_to(self.legacy,target_is_directory=True)
        with self.assertRaises(ValueError): self.op('project-alpha','history')

    def test_unsafe_directory_permission_rejected(self):
        parent=self.base/'hosted-publish-dev';parent.mkdir(mode=0o755);parent.chmod(0o755)
        with self.assertRaises(ValueError): self.op('project-alpha','history')

    def test_private_allowlist_read(self):
        f=self.base/'allowlist.json';f.write_text(json.dumps(self.allow));f.chmod(0o600)
        self.assertEqual(control.read_private(f),self.allow)
        f.chmod(0o644)
        with self.assertRaises(ValueError): control.read_private(f)

    def test_no_serve_or_unbounded_manage(self):
        with self.scoped('project-alpha') as (cfg,_):
            with self.assertRaises(ValueError): hosted.dispatch(cfg,'serve')
            with self.assertRaises(ValueError): hosted.dispatch(cfg,'manage',b' '*4097)


if __name__ == '__main__': unittest.main(verbosity=2)
