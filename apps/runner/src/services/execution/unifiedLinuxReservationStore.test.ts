import { describe,it,expect } from 'vitest';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UnifiedLinuxReservationStore } from './unifiedLinuxReservationStore.js';
import { UnifiedLinuxReservedRuntime } from './unifiedLinuxReservedRuntime.js';
import { UnifiedLinuxEnvironmentManager, type EnvironmentIdentity, type UnifiedLinuxRuntime } from './unifiedLinuxEnvironmentManager.js';
import { linuxCapabilities, type LinuxPolicy } from './unifiedLinuxPolicy.js';
import { UnifiedLinuxOfflineRuntime, offlineGuestIdentity, type OfflineRuntimeBinding } from './unifiedLinuxOfflineRuntime.js';
import { detachedGuestSpec, type DetachedGuestInspection } from './adminLabGuestLifecycle.js';
const id='env_11111111-1111-4111-8111-111111111111', successor='env_22222222-2222-4222-8222-222222222222';
const scope={tenantId:'tenant',actorId:'u:'+'c'.repeat(64),workspaceId:'workspace'};
const policy:LinuxPolicy={capabilities:Object.fromEntries(linuxCapabilities.map(k=>[k,k==='administrator'||k==='reset'])) as LinuxPolicy['capabilities'],limits:{maxTerminals:3,memoryMiB:192,cpuMillicores:500,pids:48,diskMiB:1024,idleMinutes:30,lifetimeMinutes:120}};
const identity={id,scope,policy}, next={...identity,id:successor};
const input={platform:policy,organization:policy,course:policy,entitlement:policy,verifiedRuntime:policy,requested:policy};
async function fails(fn:()=>unknown|Promise<unknown>){let failed=false;try{await fn();}catch{failed=true;}expect(failed).toBe(true);}
async function temp(fn:(root:string,store:UnifiedLinuxReservationStore)=>unknown|Promise<unknown>){const root=realpathSync(mkdtempSync(join(tmpdir(),'zoe-reservation-test-')));try{await fn(root,new UnifiedLinuxReservationStore(root));}finally{rmSync(root,{recursive:true,force:true});}}
function fake(store:UnifiedLinuxReservationStore){
 const f={state:'absent' as 'running'|'absent'|'unknown',provisions:0,destroys:0,failProvision:false,failDestroy:false,unverified:false};
 const runtime:UnifiedLinuxRuntime={provision:async()=>{f.provisions++;f.state='running';if(f.failProvision)throw Error('lost ack');},inspect:async()=>f.state,destroy:async()=>{f.destroys++;if(f.failDestroy)throw Error('cleanup');f.state=f.unverified?'unknown':'absent';}};
 const guarded=new UnifiedLinuxReservedRuntime(store,runtime);
 let count=0;const manager=new UnifiedLinuxEnvironmentManager(guarded,()=>count++===0?id:successor);
 return {f,guarded,manager,runtime};
}
describe('durable unified Linux reservations',()=>{
 it('writes the identity before granting lease',()=>temp((root,store)=>{const lease=store.acquire(identity);const files=readdirSync(root);expect(files.length).toBe(1);expect(JSON.parse(readFileSync(join(root,files[0]),'utf8')).identity).toEqual(identity);store.assertHeld(identity,lease);}));
 it('exclusive acquisition blocks same scope and different identity',()=>temp(async(root,store)=>{store.acquire(identity);await fails(()=>new UnifiedLinuxReservationStore(root).acquire(next));}));
 it('same ID does not permit reacquiring a lease',()=>temp(async(root,store)=>{store.acquire(identity);await fails(()=>new UnifiedLinuxReservationStore(root).acquire(identity));}));
 it('isolates scopes across tenants',()=>temp((root,store)=>{const a=store.acquire(identity);const foreign={...next,scope:{...scope,tenantId:'other'}};const b=store.acquire(foreign);store.assertHeld(identity,a);store.assertHeld(foreign,b);expect(readdirSync(root).length).toBe(2);}));
 it('isolates workspaces',()=>temp((root,store)=>{store.acquire(identity);store.acquire({...next,scope:{...scope,workspaceId:'other'}});expect(readdirSync(root).length).toBe(2);}));
 it('rejects wrong lease token',()=>temp(async(root,store)=>{const lease=store.acquire(identity);await fails(()=>store.releaseAfterVerifiedAbsence(identity,{...lease,token:successor.slice(4)}));expect(readdirSync(root).length).toBe(1);}));
 it('rejects modified policy',()=>temp(async(root,store)=>{const lease=store.acquire(identity);await fails(()=>store.assertHeld({...identity,policy:{...policy,limits:{...policy.limits,maxTerminals:2}}},lease));}));
 it('rejects stale lease following new allocation',()=>temp(async(root,store)=>{const lease=store.acquire(identity);store.releaseAfterVerifiedAbsence(identity,lease);const newer=store.acquire(next);await fails(()=>store.releaseAfterVerifiedAbsence(identity,lease));store.assertHeld(next,newer);}));
 it('rejects root with broad permissions',()=>temp(async(root)=>{chmodSync(root,0o755);await fails(()=>new UnifiedLinuxReservationStore(root));}));
 it('rejects root symlink',()=>temp(async(root)=>{const link=join(root,'alias');symlinkSync(root,link);await fails(()=>new UnifiedLinuxReservationStore(link));}));
 it('rejects relative path',async()=>fails(()=>new UnifiedLinuxReservationStore('.')));
 it('preserves torn reservation files',()=>temp(async(root,store)=>{const lease=store.acquire(identity),path=join(root,readdirSync(root)[0]);writeFileSync(path,'{');await fails(()=>store.assertHeld(identity,lease));await fails(()=>store.acquire(next));expect(readFileSync(path,'utf8')).toBe('{');}));
 it('does not follow reservation file symlink',()=>temp(async(root,store)=>{const lease=store.acquire(identity),path=join(root,readdirSync(root)[0]),target=join(root,'target');writeFileSync(target,'safe');rmSync(path);symlinkSync(target,path);await fails(()=>store.releaseAfterVerifiedAbsence(identity,lease));await fails(()=>store.acquire(next));expect(readFileSync(target,'utf8')).toBe('safe');}));
 it('rejects invalid environment IDs before writing',()=>temp(async(root,store)=>{await fails(()=>store.acquire({...identity,id:'env_invalid'}));expect(readdirSync(root)).toEqual([]);}));
 it('reserves before any runtime allocation',()=>temp(async(root,store)=>{const runtime:UnifiedLinuxRuntime={provision:async value=>{expect(readdirSync(root).length).toBe(1);guard.assertScopeReserved(value);},inspect:async()=> 'running',destroy:async()=>{throw Error('unexpected');}};const guard=new UnifiedLinuxReservedRuntime(store,runtime);await guard.provision(identity);expect(await guard.inspect(identity)).toBe('running');}));
 it('concurrent manager opens share one environment',()=>temp(async(root,store)=>{const {f,manager}=fake(store);const results=await Promise.all(Array.from({length:20},()=>manager.open(scope,input)));expect(results.filter(r=>r.ok&&r.action==='created').length).toBe(1);expect(results.every(r=>r.ok)).toBe(true);expect(f.provisions).toBe(1);}));
 it('restart blocks new allocation without touching old runtime',()=>temp(async(root,store)=>{const a=fake(store);await a.manager.open(scope,input);const b=fake(new UnifiedLinuxReservationStore(root));expect((await b.manager.open(scope,input)).ok).toBe(false);expect(b.f.provisions).toBe(0);expect((await b.manager.end(scope,id,true)).ok).toBe(false);expect(a.f.state).toBe('running');expect(b.f.destroys).toBe(0);}));
 it('unconfirmed end preserves runtime and lease',()=>temp(async(root,store)=>{const {f,manager}=fake(store);await manager.open(scope,input);expect((await manager.end(scope,id,false)).ok).toBe(false);expect(f.state).toBe('running');expect(readdirSync(root).length).toBe(1);}));
 it('verified explicit end releases lease and permits new environment',()=>temp(async(root,store)=>{const {f,manager}=fake(store);await manager.open(scope,input);expect((await manager.end(scope,id,true)).ok).toBe(true);expect(readdirSync(root)).toEqual([]);expect((await manager.open(scope,input)).ok).toBe(true);expect(f.provisions).toBe(2);}));
 it('lost provisioning acknowledgement holds lease until explicit end',()=>temp(async(root,store)=>{const {f,manager}=fake(store);f.failProvision=true;expect((await manager.open(scope,input)).ok).toBe(false);expect(readdirSync(root).length).toBe(1);expect((await manager.end(scope,id,true)).ok).toBe(true);expect(readdirSync(root)).toEqual([]);}));
 it('cleanup failure retains reservation for retry',()=>temp(async(root,store)=>{const {f,manager}=fake(store);await manager.open(scope,input);f.failDestroy=true;expect((await manager.end(scope,id,true)).ok).toBe(false);expect(readdirSync(root).length).toBe(1);f.failDestroy=false;expect((await manager.end(scope,id,true)).ok).toBe(true);expect(readdirSync(root)).toEqual([]);}));
 it('unknown cleanup does not release',()=>temp(async(root,store)=>{const {f,manager}=fake(store);await manager.open(scope,input);f.unverified=true;expect((await manager.end(scope,id,true)).ok).toBe(false);expect(readdirSync(root).length).toBe(1);}));
 it('absence during inspect is not permission to clear a lease',()=>temp(async(root,store)=>{const {f,manager,guarded}=fake(store);await manager.open(scope,input);f.state='absent';expect(await guarded.inspect(identity)).toBe('unknown');expect(readdirSync(root).length).toBe(1);expect((await manager.end(scope,id,true)).ok).toBe(true);expect(f.destroys).toBe(0);expect(readdirSync(root)).toEqual([]);}));
 it('foreign identity cannot destroy a runtime',()=>temp(async(root,store)=>{const {f,guarded}=fake(store);await guarded.provision(identity);const foreign={...identity,scope:{...scope,tenantId:'foreign'}};await fails(()=>guarded.destroy(foreign));expect(f.destroys).toBe(0);expect(await guarded.inspect(foreign)).toBe('unknown');}));
 it('lost or tampered lease blocks resume and destruction',()=>temp(async(root,store)=>{const {f,manager}=fake(store);await manager.open(scope,input);writeFileSync(join(root,readdirSync(root)[0]),'corrupt');expect((await manager.open(scope,input)).ok).toBe(false);expect((await manager.end(scope,id,true)).ok).toBe(false);expect(f.destroys).toBe(0);}));
});

function composed(store:UnifiedLinuxReservationStore){
 const image='sha256:'+'a'.repeat(64),cid='b'.repeat(64),spec=detachedGuestSpec(offlineGuestIdentity(identity,image));
 const f={volume:false,guest:null as DetachedGuestInspection|null,events:[] as string[],loseGuest:false,failVolumeRemove:false};
 const binding:OfflineRuntimeBinding={image,assertScopeReserved:async value=>guard.assertScopeReserved(value),verifyReady:async()=>{if(!f.guest?.running)throw Error('not ready');},
 guest:{assertAuthorized:()=>{},verifyPrerequisites:async()=>{if(!f.volume)throw Error('volume missing');},inspect:async()=>f.guest,create:async()=>{f.events.push('createGuest');f.guest={id:cid,name:'/'+spec.name,image,labels:spec.labels,running:false,network:'none',privileged:false,volumeNames:[spec.volume],hasBind:false,autoRemove:false,user:'0:0',tty:false,openStdin:false};if(f.loseGuest)throw Error('lost ack');return cid;},start:async()=>{if(f.guest)f.guest.running=true;},remove:async()=>{f.events.push('removeGuest');f.guest=null;}},
 resources:{assertAuthorized:()=>{},isolationEnabled:()=>false,egressImage:()=>null,networkName:()=> 'network',proxyName:()=> 'proxy',volumeName:()=>spec.volume,createNetwork:async()=>{throw Error('no network');},createProxy:async()=>{throw Error('no proxy');},createVolume:async()=>{guard.assertScopeReserved(identity);f.events.push('createVolume');f.volume=true;return spec.volume;},removeVolume:async()=>{f.events.push('removeVolume');if(f.failVolumeRemove)throw Error('volume cleanup');f.volume=false;},removeProxy:async()=>{throw Error('no proxy');},removeNetwork:async()=>{throw Error('no network');},networkAbsent:async()=>true,volumeAbsent:async()=>!f.volume}};
 const runtime=new UnifiedLinuxOfflineRuntime(()=>binding),guard=new UnifiedLinuxReservedRuntime(store,runtime),manager=new UnifiedLinuxEnvironmentManager(guard,()=>id);
 return {f,manager};
}
describe('durable reservation and U2B3 composition',()=>{
 it('retains reservation across real coordinator open and resume',()=>temp(async(root,store)=>{const {f,manager}=composed(store);expect((await manager.open(scope,input)).ok).toBe(true);expect((await manager.open(scope,input)).ok).toBe(true);expect(f.events).toEqual(['createVolume','createGuest']);expect(readdirSync(root).length).toBe(1);}));
 it('lost guest creation acknowledgement holds lease until verified cleanup',()=>temp(async(root,store)=>{const {f,manager}=composed(store);f.loseGuest=true;expect((await manager.open(scope,input)).ok).toBe(false);expect(readdirSync(root).length).toBe(1);expect((await manager.end(scope,id,true)).ok).toBe(true);expect(f.events.slice(-2)).toEqual(['removeGuest','removeVolume']);expect(readdirSync(root)).toEqual([]);}));
 it('guest removal alone is not enough to release reservation',()=>temp(async(root,store)=>{const {f,manager}=composed(store);await manager.open(scope,input);f.failVolumeRemove=true;expect((await manager.end(scope,id,true)).ok).toBe(false);expect(f.guest).toBe(null);expect(readdirSync(root).length).toBe(1);f.failVolumeRemove=false;expect((await manager.end(scope,id,true)).ok).toBe(true);expect(readdirSync(root)).toEqual([]);}));
 it('conflicting instance cannot touch the occupied scope',()=>temp(async(root,store)=>{const a=composed(store);await a.manager.open(scope,input);const b=composed(new UnifiedLinuxReservationStore(root));expect((await b.manager.open(scope,input)).ok).toBe(false);expect(b.f.events).toEqual([]);expect(a.f.guest?.running).toBe(true);}));
});
