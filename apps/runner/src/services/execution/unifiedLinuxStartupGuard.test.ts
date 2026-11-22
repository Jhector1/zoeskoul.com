import { describe,it,expect } from 'vitest';
import { mkdtempSync,realpathSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNoUnifiedStartupResources,assertUnifiedStartupReservations,unifiedVolumeMarker } from './unifiedLinuxStartupGuard.js';
import { detachedGuestMarker } from './adminLabGuestLifecycle.js';
import { UnifiedLinuxReservationStore } from './unifiedLinuxReservationStore.js';
import { linuxCapabilities,type LinuxPolicy } from './unifiedLinuxPolicy.js';
const policy:LinuxPolicy={capabilities:Object.fromEntries(linuxCapabilities.map(k=>[k,k==='administrator'||k==='reset'])) as LinuxPolicy['capabilities'],limits:{maxTerminals:3,memoryMiB:192,cpuMillicores:500,pids:48,diskMiB:1024,idleMinutes:30,lifetimeMinutes:120}};
const identity={id:'env_11111111-1111-4111-8111-111111111111',scope:{tenantId:'tenant',actorId:'u:'+'c'.repeat(64),workspaceId:'workspace'},policy};
function temp(fn:(root:string)=>void){const root=realpathSync(mkdtempSync(join(tmpdir(),'unified-startup-')));try{fn(root);}finally{rmSync(root,{recursive:true,force:true});}}
function fails(fn:()=>void){let failed=false;try{fn();}catch{failed=true;}expect(failed).toBe(true);}
describe('unified startup safety gate',()=>{
  it('allows old installations with no unified configuration',()=>assertUnifiedStartupReservations({}));
  it('allows unrelated labels and null labels',()=>assertNoUnifiedStartupResources([{}, {Labels:null},{Labels:{'com.zoeskoul.runner':'true'}}]));
  it('blocks guest marker regardless of value',()=>fails(()=>assertNoUnifiedStartupResources([{Labels:{[detachedGuestMarker]:''}}])));
  it('blocks workspace marker independently',()=>fails(()=>assertNoUnifiedStartupResources([{Labels:{[unifiedVolumeMarker]:'future'}}])));
  it('blocks flag activation before startup adoption is ready',()=>fails(()=>assertUnifiedStartupReservations({ZOESKOUL_LEARNING_UNIFIED_DETACHED_DEV:'true'})));
  it('allows an empty configured directory when disabled',()=>temp(root=>assertUnifiedStartupReservations({ZOESKOUL_LEARNING_UNIFIED_RESERVATION_ROOT:root})));
  it('blocks a reservation even when runtime is disabled',()=>temp(root=>{new UnifiedLinuxReservationStore(root).acquire(identity);fails(()=>assertUnifiedStartupReservations({ZOESKOUL_LEARNING_UNIFIED_RESERVATION_ROOT:root,ZOESKOUL_LEARNING_UNIFIED_DETACHED_DEV:'false'}));expect(new UnifiedLinuxReservationStore(root).inventory().length).toBe(1);}));
  it('blocks missing configured directory',()=>temp(root=>fails(()=>assertUnifiedStartupReservations({ZOESKOUL_LEARNING_UNIFIED_RESERVATION_ROOT:join(root,'missing')}))));
  it('blocks corrupt inventory',()=>temp(root=>{writeFileSync(join(root,'a'.repeat(64)+'.json'),'invalid',{mode:0o600});fails(()=>assertUnifiedStartupReservations({ZOESKOUL_LEARNING_UNIFIED_RESERVATION_ROOT:root}));}));
  it('blocks empty configured path',()=>fails(()=>assertUnifiedStartupReservations({ZOESKOUL_LEARNING_UNIFIED_RESERVATION_ROOT:''})));
});
