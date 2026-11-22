import copy
import unittest
from firewall_renewal_plan import plan_renewal

class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.now = 1700000000
        self.snapshot = {'expiresAt': self.now + 3600, 'hosts': {
            'archive.ubuntu.com': ['91.189.91.81', '91.189.91.82'],
            'security.ubuntu.com': ['91.189.91.81'],
            'example.com': ['93.184.216.34'],
        }}
        self.args = dict(now=self.now, previous_expiry=self.now+2700, session_deadline=self.now+7200)
    def plan(self, **args):
        return plan_renewal(self.snapshot, **(self.args | args))
    def test_exact_batch(self):
        plan=self.plan()
        self.assertEqual(plan.batch, '\n'.join([
            'flush set inet zoe_learning_egress approved_http',
            'flush set inet zoe_learning_egress approved_https',
            'add element inet zoe_learning_egress approved_http { 91.189.91.81 timeout 3590s, 91.189.91.82 timeout 3590s }',
            'add element inet zoe_learning_egress approved_https { 93.184.216.34 timeout 3590s }', '']))
    def test_deadline_cap(self):
        p=self.plan(session_deadline=self.now+2800)
        self.assertEqual(p.expires_at,self.now+2800)
        self.assertEqual(p.kernel_ttl_seconds,2790)
    def test_expired_or_invalid_previous(self):
        for expiry in [self.now-1,self.now,self.now+3601,True]:
            with self.subTest(expiry=expiry), self.assertRaises(ValueError): self.plan(previous_expiry=expiry)
    def test_previous_beyond_deadline(self):
        with self.assertRaises(ValueError): self.plan(session_deadline=self.now+2000)
    def test_stale_publication(self):
        self.snapshot['expiresAt']=self.now+2700
        with self.assertRaises(ValueError): self.plan()
    def test_excessive_or_short_snapshot(self):
        for seconds in [0,59,3601]:
            self.snapshot['expiresAt']=self.now+seconds
            with self.subTest(seconds=seconds),self.assertRaises(ValueError): self.plan()
    def test_insufficient_apply_window(self):
        with self.assertRaises(ValueError): self.plan(previous_expiry=self.now+1, session_deadline=self.now+14)
    def test_unsafe_addresses(self):
        for ip in ['10.0.0.1','127.0.0.1','169.254.169.254','100.64.0.1','192.0.0.9','192.0.2.1','224.0.0.1','255.255.255.255','::1','8.8.8.8; delete table inet x','010.1.1.1',4]:
            self.snapshot['hosts']['example.com']=[ip]
            with self.subTest(ip=ip),self.assertRaises(ValueError): self.plan()
    def test_invalid_host_set(self):
        self.snapshot['hosts']['google.com']=['8.8.8.8']
        with self.assertRaises(ValueError): self.plan()
    def test_empty_duplicate_and_oversized(self):
        for entries in [[],['8.8.8.8']*2,[f'8.8.8.{i}' for i in range(1,34)],'8.8.8.8']:
            self.snapshot['hosts']['example.com']=entries
            with self.subTest(entries=entries),self.assertRaises(ValueError): self.plan()
    def test_no_mutation_and_determinism(self):
        before=copy.deepcopy(self.snapshot)
        p=self.plan(); q=self.plan()
        self.assertEqual(p,q);self.assertEqual(before,self.snapshot)
    def test_bad_snapshot_shape(self):
        self.snapshot['extra']=True
        with self.assertRaises(ValueError): self.plan()

if __name__=='__main__': unittest.main(verbosity=2)
