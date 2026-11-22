import copy
import json
import unittest
from firewall_renewal_execute import inspect_table, execute, TABLE

NOW=1700000000
OLD={'hosts':{'archive.ubuntu.com':['91.189.91.81'],'security.ubuntu.com':['91.189.91.82'],'example.com':['93.184.216.34']},'expiresAt':NOW+1800}
NEW={'hosts':{'archive.ubuntu.com':['91.189.91.83'],'security.ubuntu.com':['91.189.91.82'],'example.com':['93.184.216.35']},'expiresAt':NOW+3600}

# Model nft JSON schema, not a captured kernel trace. No live nft invocation.
def fixture(snapshot,ttl,remaining):
    xs=[{'metainfo':{'version':'1.0.9'}},{'table':{'name':TABLE,'family':'inet','handle':1}}]
    for k,hosts in [('approved_http',['archive.ubuntu.com','security.ubuntu.com']),('approved_https',['example.com'])]:
        xs.append({'set':{'family':'inet','table':TABLE,'name':k,'type':'ipv4_addr','flags':['timeout'],'elem':[{'elem':{'val':ip,'timeout':ttl,'expires':remaining}} for h in hosts for ip in snapshot['hosts'][h]]}})
    for name,count in [('input',5),('output',6),('forward',0)]:
        xs.append({'chain':{'family':'inet','table':TABLE,'name':name,'type':'filter','policy':'drop','hook':name,'prio':0}})
        for i in range(count):
            xs.append({'rule':{'family':'inet','table':TABLE,'chain':name,'handle':10+i,'expr':[{'match':{'op':'==','left':{'meta':{'key':'l4proto'}},'right':'tcp'}},{'counter':{'packets':i,'bytes':i*50}},{'accept':None}]}})
    return {'nftables':xs}

class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.old=fixture(OLD,2000,1790); self.new=fixture(NEW,3590,3589)
        self.fp=inspect_table(self.old)[0];self.calls=[];self.wallv=NOW;self.monov=0
    def command(self,args,batch,timeout):
        self.calls.append((args,batch));self.assertGreater(timeout,0);self.assertLessEqual(timeout,7)
        if len(self.calls)==1:return json.dumps(self.old)
        if len(self.calls)==4:return json.dumps(self.new)
        return ''
    def run_update(self,**kwargs):
        return execute(NEW,OLD,NOW+7200,self.fp,command=self.command,wall=lambda:self.wallv,monotonic=lambda:self.monov,**kwargs)
    def test_order_and_single_apply(self):
        self.assertEqual(self.run_update(),NOW+3600)
        self.assertEqual([x[0][0] for x in self.calls],['-j','-c','-f','-j'])
        self.assertEqual(self.calls[1][1],self.calls[2][1]);self.assertEqual(len(self.calls[2][1].splitlines()),4)
    def test_counters_and_ttl_do_not_change_structure_hash(self):
        self.new['nftables'][-2]['rule']['expr'][1]['counter']['packets']=999
        self.assertEqual(inspect_table(self.new)[0],self.fp)
    def test_rule_change_rejected_before_mutation(self):
        self.old['nftables'][-2]['rule']['expr'][0]['match']['right']='udp'
        with self.assertRaisesRegex(ValueError,'STRUCTURE_CHANGED'): self.run_update()
        self.assertEqual(len(self.calls),1)
    def test_default_drop_required(self):
        self.old['nftables'][-1]['chain']['policy']='accept'
        with self.assertRaisesRegex(ValueError,'NFT_CHAIN'):self.run_update()
        self.assertEqual(len(self.calls),1)
    def test_missing_rule_rejected(self):
        del self.old['nftables'][-2]
        with self.assertRaisesRegex(ValueError,'NFT_STRUCTURE'):self.run_update()
    def test_previous_address_mismatch(self):
        self.old['nftables'][2]['set']['elem'][0]['elem']['val']='8.8.8.8'
        with self.assertRaisesRegex(ValueError,'ADDRESS_SET_CHANGED'):self.run_update()
        self.assertEqual(len(self.calls),1)
    def test_old_expiry_exceeds_claim(self):
        self.old['nftables'][2]['set']['elem'][0]['elem']['expires']=1900
        with self.assertRaisesRegex(ValueError,'NFT_ELEMENT_TTL'):self.run_update()
    def test_post_apply_ttl_mismatch(self):
        self.new['nftables'][3]['set']['elem'][0]['elem']['timeout']=3600
        with self.assertRaisesRegex(ValueError,'NFT_ELEMENT_TTL'):self.run_update()
        self.assertEqual(len(self.calls),4)
    def test_post_apply_address_mismatch(self):
        self.new['nftables'][3]['set']['elem'][0]['elem']['val']='8.8.8.8'
        with self.assertRaisesRegex(ValueError,'ADDRESS_SET_CHANGED'):self.run_update()
        self.assertEqual(len(self.calls),4)
    def test_dry_run_error_never_applies(self):
        original=self.command
        def fail(args,batch,timeout):
            result=original(args,batch,timeout)
            if args[0]=='-c':raise RuntimeError('check failed')
            return result
        self.command=fail
        with self.assertRaisesRegex(RuntimeError,'check failed'):self.run_update()
        self.assertEqual(len(self.calls),2)
    def test_budget_prevents_late_apply(self):
        original=self.command
        def slow(args,batch,timeout):
            result=original(args,batch,timeout)
            if args[0]=='-c':self.monov=7;self.wallv+=7
            return result
        self.command=slow
        with self.assertRaisesRegex(ValueError,'CLOCK_OR_BUDGET'):self.run_update()
        self.assertEqual(len(self.calls),2)
    def test_backward_wall_clock_rejected(self):
        original=self.command
        def jump(args,batch,timeout):
            result=original(args,batch,timeout)
            if args[0]=='-c':self.wallv-=5
            return result
        self.command=jump
        with self.assertRaisesRegex(ValueError,'CLOCK_OR_BUDGET'):self.run_update()
        self.assertEqual(len(self.calls),2)
    def test_unknown_element_shape_rejected(self):
        self.old['nftables'][2]['set']['elem']=['91.189.91.81']
        with self.assertRaisesRegex(ValueError,'NFT_ELEMENT'):self.run_update()
    def test_invalid_fingerprint_never_executes(self):
        self.fp='bad'
        with self.assertRaisesRegex(ValueError,'FINGERPRINT'):self.run_update()
        self.assertEqual(len(self.calls),0)

if __name__=='__main__':unittest.main(verbosity=2)
