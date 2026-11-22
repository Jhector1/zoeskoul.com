import { PassThrough } from "node:stream";
import { describe,it,expect } from 'vitest';
import { UnifiedLinuxOfflineRuntime, offlineGuestIdentity, assertOfflinePolicy, type OfflineRuntimeBinding } from './unifiedLinuxOfflineRuntime.js';
import { UnifiedLinuxEnvironmentManager, type EnvironmentIdentity } from './unifiedLinuxEnvironmentManager.js';
import { linuxCapabilities, type LinuxPolicy } from './unifiedLinuxPolicy.js';
import { detachedGuestSpec, type DetachedGuestInspection } from './adminLabGuestLifecycle.js';
const id='env_11111111-1111-4111-8111-111111111111', image='sha256:'+'a'.repeat(64), cid='b'.repeat(64);
const scope={tenantId:'tenant',actorId:'u:'+'c'.repeat(64),workspaceId:'workspace'};
const policy:LinuxPolicy={capabilities:Object.fromEntries(linuxCapabilities.map(k=>[k,k==='administrator'||k==='reset'])) as LinuxPolicy['capabilities'],limits:{maxTerminals:3,memoryMiB:192,cpuMillicores:500,pids:48,diskMiB:1024,idleMinutes:30,lifetimeMinutes:120}};
const identity={id,scope,policy};
const input={platform:policy,organization:policy,course:policy,entitlement:policy,verifiedRuntime:policy,requested:policy};
async function fails(fn:()=>unknown|Promise<unknown>){let failed=false;try{await fn();}catch{failed=true;}expect(failed).toBe(true);}
function fixture(){
 const spec=detachedGuestSpec(offlineGuestIdentity(identity,image));
 const f={volume:false,guest:null as DetachedGuestInspection|null,authorized:true,isolated:false,ready:true,reserved:true,loseVolume:false,loseGuest:false,failRemove:false,failVolumeRemove:false,events:[] as string[]};
 const binding:OfflineRuntimeBinding={image,
  assertScopeReserved:async()=>{if(!f.reserved)throw Error('reservation');},verifyReady:async()=>{if(!f.ready)throw Error('readiness');},
  guest:{assertAuthorized:()=>{if(!f.authorized)throw Error('revoked');}, verifyPrerequisites:async()=>{if(!f.volume)throw Error('volume missing');},
   inspect:async()=>f.guest,create:async()=>{f.events.push('createGuest');f.guest={id:cid,name:'/'+spec.name,image,labels:spec.labels,running:false,network:'none',privileged:false,volumeNames:[spec.volume],hasBind:false,autoRemove:false,user:'0:0',tty:false,openStdin:false};if(f.loseGuest)throw Error('lost ack');return cid;},
   start:async()=>{f.events.push('start');if(f.guest)f.guest.running=true;},remove:async()=>{f.events.push('removeGuest');if(f.failRemove)throw Error('remove');f.guest=null;}},
  resources:{assertAuthorized:()=>{if(!f.authorized)throw Error('revoked');},isolationEnabled:()=>f.isolated,egressImage:()=>null,
   networkName:()=> 'network',proxyName:()=> 'proxy',volumeName:()=>spec.volume,createNetwork:async()=>{throw Error('no network');},createProxy:async()=>{throw Error('no proxy');},
   createVolume:async()=>{f.events.push('createVolume');f.volume=true;if(f.loseVolume)throw Error('lost ack');return spec.volume;},removeVolume:async()=>{f.events.push('removeVolume');if(f.failVolumeRemove)throw Error('remove');f.volume=false;},removeProxy:async()=>{throw Error('no proxy');},removeNetwork:async()=>{throw Error('no network');},networkAbsent:async()=>true,volumeAbsent:async()=>!f.volume}};
 const runtime=new UnifiedLinuxOfflineRuntime(()=>binding), manager=new UnifiedLinuxEnvironmentManager(runtime,()=>id);
 return {f,runtime,manager,binding};
}
describe('offline environment runtime composition',()=>{
 it('maps environment UUID to existing session resource format',()=>expect(offlineGuestIdentity(identity,image).sessionId).toBe(id.replace('env_','sess_')));
 it('rejects malformed identifiers',async()=>fails(()=>offlineGuestIdentity({...identity,id:'env_not_uuid'},image)));
 it('rejects foreign actor format',async()=>fails(()=>offlineGuestIdentity({...identity,scope:{...scope,actorId:'other'}},image)));
 it('rejects non-admin profile',async()=>fails(()=>assertOfflinePolicy({...identity,policy:{...policy,capabilities:{...policy.capabilities,administrator:false}}})));
 it('rejects protected network profile',async()=>fails(()=>assertOfflinePolicy({...identity,policy:{...policy,capabilities:{...policy.capabilities,protectedEgress:true}}})));
 it('rejects below fixed memory cap',async()=>fails(()=>assertOfflinePolicy({...identity,policy:{...policy,limits:{...policy.limits,memoryMiB:128}}})));
 it('rejects below fixed cpu cap',async()=>fails(()=>assertOfflinePolicy({...identity,policy:{...policy,limits:{...policy.limits,cpuMillicores:250}}})));
 it('rejects below fixed pid cap',async()=>fails(()=>assertOfflinePolicy({...identity,policy:{...policy,limits:{...policy.limits,pids:32}}})));
 it('opens and resumes with only one guest and one volume',async()=>{const {f,manager}=fixture();const a=await Promise.all([manager.open(scope,input),manager.open(scope,input)]);expect(a.map(x=>x.ok?x.action:'fail')).toEqual(['created','resumed']);expect(f.events).toEqual(['createVolume','createGuest','start']);});
 it('preserves guest after unconfirmed end',async()=>{const {f,manager}=fixture();await manager.open(scope,input);expect((await manager.end(scope,id,false)).ok).toBe(false);expect(f.guest?.running).toBe(true);});
 it('confirmed end removes guest before volume',async()=>{const {f,manager}=fixture();await manager.open(scope,input);expect((await manager.end(scope,id,true)).ok).toBe(true);expect(f.events.slice(-2)).toEqual(['removeGuest','removeVolume']);});
 it('blocks if reservation proof fails',async()=>{const {f,manager}=fixture();f.reserved=false;expect((await manager.open(scope,input)).ok).toBe(false);expect(f.events).toEqual([]);});
 it('blocks if offline network policy changes',async()=>{const {f,manager}=fixture();f.isolated=true;expect((await manager.open(scope,input)).ok).toBe(false);expect(f.events).toEqual([]);});
 it('does not remove preexisting volume',async()=>{const {f,manager}=fixture();f.volume=true;expect((await manager.open(scope,input)).ok).toBe(false);expect((await manager.end(scope,id,true)).ok).toBe(false);expect(f.volume).toBe(true);expect(f.events).toEqual([]);});
 it('lost volume acknowledgement preserves allocation until explicit end',async()=>{const {f,manager}=fixture();f.loseVolume=true;expect((await manager.open(scope,input)).ok).toBe(false);expect((await manager.open(scope,input)).ok).toBe(false);expect(f.events).toEqual(['createVolume']);expect((await manager.end(scope,id,true)).ok).toBe(true);expect(f.volume).toBe(false);});
 it('lost guest acknowledgement can be cleaned by verified name',async()=>{const {f,manager}=fixture();f.loseGuest=true;expect((await manager.open(scope,input)).ok).toBe(false);expect((await manager.end(scope,id,true)).ok).toBe(true);expect(f.events.slice(-2)).toEqual(['removeGuest','removeVolume']);});
 it('does not report readiness until verified',async()=>{const {f,manager}=fixture();f.ready=false;expect((await manager.open(scope,input)).ok).toBe(false);expect(manager.get(scope)?.state).toBe('cleanup_pending');expect(f.guest?.running).toBe(true);});
 it('revocation blocks resume but allows verified cleanup',async()=>{const {f,manager}=fixture();await manager.open(scope,input);f.authorized=false;expect((await manager.open(scope,input)).ok).toBe(false);expect((await manager.end(scope,id,true)).ok).toBe(true);});
 it('rejects foreign scope inspection and removal',async()=>{const {runtime}=fixture();await runtime.provision(identity);const foreign={...identity,scope:{...scope,tenantId:'foreign'}};expect(await runtime.inspect(foreign)).toBe('unknown');await fails(()=>runtime.destroy(foreign));});
 it('does not remove a changed guest id',async()=>{const {f,manager}=fixture();await manager.open(scope,input);if(f.guest)f.guest.id='d'.repeat(64);expect((await manager.end(scope,id,true)).ok).toBe(false);expect(f.volume).toBe(true);});
 it('does not remove altered guest labels',async()=>{const {f,manager}=fixture();await manager.open(scope,input);if(f.guest)f.guest.labels={};expect((await manager.end(scope,id,true)).ok).toBe(false);expect(f.volume).toBe(true);});
 it('failed guest teardown blocks volume removal and retry allocation',async()=>{const {f,manager}=fixture();await manager.open(scope,input);f.failRemove=true;expect((await manager.end(scope,id,true)).ok).toBe(false);expect(f.volume).toBe(true);expect((await manager.open(scope,input)).ok).toBe(false);});
 it('volume teardown failure keeps capacity reserved until retry',async()=>{const {f,manager}=fixture();await manager.open(scope,input);f.failVolumeRemove=true;expect((await manager.end(scope,id,true)).ok).toBe(false);expect(f.guest).toBe(null);expect((await manager.open(scope,input)).ok).toBe(false);f.failVolumeRemove=false;expect((await manager.end(scope,id,true)).ok).toBe(true);});
 it('missing volume invalidates resume',async()=>{const {f,manager}=fixture();await manager.open(scope,input);f.volume=false;expect((await manager.open(scope,input)).ok).toBe(false);});
 it('unknown identity never claims absence',async()=>{const {runtime}=fixture();expect(await runtime.inspect(identity)).toBe('unknown');});
});

function terminalFixture(){
 const fixtureValue=fixture(), {binding,f}=fixtureValue;let attaches=0;
 binding.openTerminal=async(containerId,authorize)=>{await authorize();expect(containerId).toBe(cid);attaches++;return {stream:new PassThrough(),resize:async()=>{},disconnect:()=>{},exited:async()=>true};};
 return {...fixtureValue,attaches:()=>attaches};
}
describe('offline terminal attachment',()=>{
 it('attaches multiple terminals to the same verified guest',async()=>{const {manager,f,attaches}=terminalFixture();await manager.open(scope,input);expect((await manager.attachTerminal(scope,id)).ok).toBe(true);expect((await manager.attachTerminal(scope,id)).ok).toBe(true);expect(attaches()).toBe(2);expect(f.events).toEqual(['createVolume','createGuest','start']);});
 it('rejects a lost external reservation before exec',async()=>{const {manager,f,attaches}=terminalFixture();await manager.open(scope,input);f.reserved=false;expect((await manager.attachTerminal(scope,id)).ok).toBe(false);expect(attaches()).toBe(0);});
 it('rechecks authorization during attachment',async()=>{const {manager,f,binding}=terminalFixture();await manager.open(scope,input);binding.openTerminal=async(_id,authorize)=>{f.authorized=false;await authorize();throw Error('unreachable');};expect((await manager.attachTerminal(scope,id)).ok).toBe(false);expect(manager.get(scope)?.terminalCount).toBe(1);expect(f.guest?.running).toBe(true);});
 it('rejects changed immutable container identity',async()=>{const {manager,f,attaches}=terminalFixture();await manager.open(scope,input);if(f.guest)f.guest.id='d'.repeat(64);expect((await manager.attachTerminal(scope,id)).ok).toBe(false);expect(attaches()).toBe(0);});
});
