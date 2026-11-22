import {describe,it,expect} from 'vitest';
import {mkdtempSync,realpathSync,rmSync,readdirSync,readFileSync,writeFileSync,chmodSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UnifiedLinuxReservationStore} from './unifiedLinuxReservationStore.js';
import {reconcileUnifiedLinuxReservations,type ReconciliationProbe} from './unifiedLinuxReconciliation.js';
import {linuxCapabilities,type LinuxPolicy} from './unifiedLinuxPolicy.js';
import {detachedGuestSpec,type DetachedGuestInspection} from './adminLabGuestLifecycle.js';
import {offlineGuestIdentity} from './unifiedLinuxOfflineRuntime.js';
const image='sha256:'+'a'.repeat(64),id='env_11111111-1111-4111-8111-111111111111';
const policy:LinuxPolicy={capabilities:Object.fromEntries(linuxCapabilities.map(k=>[k,k==='administrator'||k==='reset'])) as LinuxPolicy['capabilities'],limits:{maxTerminals:3,memoryMiB:192,cpuMillicores:500,pids:48,diskMiB:1024,idleMinutes:30,lifetimeMinutes:120}};
const identity={id,scope:{tenantId:'tenant',actorId:'u:'+'c'.repeat(64),workspaceId:'workspace'},policy};
const spec=detachedGuestSpec(offlineGuestIdentity(identity,image));
const guest:DetachedGuestInspection={id:'b'.repeat(64),name:'/'+spec.name,image,labels:spec.labels,running:true,network:'none',privileged:false,volumeNames:[spec.volume],hasBind:false,autoRemove:false,user:'0:0',tty:false,openStdin:false};
function probe(overrides:Partial<ReconciliationProbe>={}):ReconciliationProbe{return {image,inspect:async()=>guest,volume:async()=> 'verified',verifyImage:async()=>{},...overrides};}
async function run(fn:(root:string,store:UnifiedLinuxReservationStore)=>unknown|Promise<unknown>){const root=realpathSync(mkdtempSync(join(tmpdir(),'zoe-reconcile-')));try{const store=new UnifiedLinuxReservationStore(root);await fn(root,store);}finally{rmSync(root,{recursive:true,force:true});}}
async function fails(fn:()=>unknown|Promise<unknown>){let failed=false;try{await fn();}catch{failed=true;}expect(failed).toBe(true);}
async function state(store:UnifiedLinuxReservationStore,p:ReconciliationProbe){return (await reconcileUnifiedLinuxReservations(store,p))[0].state;}
describe('read-only restart reconciliation',()=>{
 it('empty inventory makes no Docker calls',()=>run(async(_,s)=>{expect(await reconcileUnifiedLinuxReservations(s,probe({inspect:async()=>{throw Error('unexpected');}}))).toEqual([]);}));
 it('reads original identity without exposing lease token',()=>run((_,s)=>{const lease=s.acquire(identity);expect(s.inventory()).toEqual([identity]);expect(JSON.stringify(s.inventory()).includes(lease.token)).toBe(false);}));
 it('reports matching running candidate without changing reservation',()=>run(async(root,s)=>{const lease=s.acquire(identity),path=join(root,readdirSync(root)[0]),before=readFileSync(path,'utf8');expect(await state(s,probe())).toBe('running_candidate');expect(readFileSync(path,'utf8')).toBe(before);s.assertHeld(identity,lease);}));
 it('reports both missing but keeps lease',()=>run(async(root,s)=>{s.acquire(identity);expect(await state(s,probe({inspect:async()=>null,volume:async()=> 'absent'}))).toBe('no_guest_or_volume');expect(readdirSync(root).length).toBe(1);}));
 it('reports surviving verified volume',()=>run(async(_,s)=>{s.acquire(identity);expect(await state(s,probe({inspect:async()=>null}))).toBe('volume_without_guest');}));
 for(const [name,changed] of Object.entries({stopped:{running:false},foreign:{labels:{}},image:{image:'sha256:'+'d'.repeat(64)},network:{network:'bridge'},privileged:{privileged:true},mount:{hasBind:true},volume:{volumeNames:['other']}}))it('blocks '+name,()=>run(async(_,s)=>{s.acquire(identity);expect(await state(s,probe({inspect:async()=>({...guest,...changed})}))).toBe('unverified');}));
 it('blocks absent volume with live guest',()=>run(async(_,s)=>{s.acquire(identity);expect(await state(s,probe({volume:async()=> 'absent'}))).toBe('unverified');}));
 it('blocks unverified volume',()=>run(async(_,s)=>{s.acquire(identity);expect(await state(s,probe({volume:async()=> 'unknown'}))).toBe('unverified');}));
 it('blocks daemon errors',()=>run(async(_,s)=>{s.acquire(identity);expect(await state(s,probe({inspect:async()=>{throw Error('daemon');}}))).toBe('unverified');}));
 it('blocks unverified image',()=>run(async(_,s)=>{s.acquire(identity);expect(await state(s,probe({verifyImage:async()=>{throw Error('image');}}))).toBe('unverified');}));
 it('blocks replacement during inspection',()=>run(async(_,s)=>{s.acquire(identity);let count=0;expect(await state(s,probe({inspect:async()=>({...guest,id:(count++===0?'b':'d').repeat(64)})}))).toBe('unverified');}));
 it('blocks changed inventory during inspection',()=>run(async(_,s)=>{const lease=s.acquire(identity);await fails(()=>reconcileUnifiedLinuxReservations(s,probe({verifyImage:async()=>s.releaseAfterVerifiedAbsence(identity,lease)})));}));
 it('rejects corrupted file without deleting it',()=>run(async(root,s)=>{s.acquire(identity);const p=join(root,readdirSync(root)[0]);writeFileSync(p,'{');await fails(()=>s.inventory());expect(readFileSync(p,'utf8')).toBe('{');}));
 it('rejects symlink',()=>run(async(root,s)=>{s.acquire(identity);const p=join(root,readdirSync(root)[0]);rmSync(p);symlinkSync('/dev/null',p);await fails(()=>s.inventory());}));
 it('rejects broad file permissions',()=>run(async(root,s)=>{s.acquire(identity);chmodSync(join(root,readdirSync(root)[0]),0o644);await fails(()=>s.inventory());}));
 it('rejects unexpected directory entry',()=>run(async(root,s)=>{writeFileSync(join(root,'foreign'),'x');await fails(()=>s.inventory());}));
 it('rejects duplicate environment id across scopes',()=>run(async(_,s)=>{s.acquire(identity);s.acquire({...identity,scope:{...identity.scope,workspaceId:'other'}});await fails(()=>s.inventory());}));
 it('rejects unsupported policy',()=>run(async(_,s)=>{s.acquire({...identity,policy:{...policy,capabilities:{...policy.capabilities,systemd:true}}});expect(await state(s,probe())).toBe('unverified');}));
});
