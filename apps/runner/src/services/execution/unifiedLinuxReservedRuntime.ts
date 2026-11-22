import type { EnvironmentIdentity, UnifiedLinuxRuntime, UnifiedLinuxTerminal, UnifiedPythonProgram } from './unifiedLinuxEnvironmentManager.js';
import { reservationIdentityKey, UnifiedLinuxReservationStore } from './unifiedLinuxReservationStore.js';

type Entry={lease:ReturnType<UnifiedLinuxReservationStore['acquire']>; released:boolean; busy:boolean};
/** Wraps the U2B3 runtime. Durable exclusion is acquired before provisioning.
 * Only this process can release a lease it acquired. Reopening after a Runner
 * restart will fail closed until trusted reconciliation is implemented. */
export class UnifiedLinuxReservedRuntime implements UnifiedLinuxRuntime {
  private readonly leases=new Map<string,Entry>();
  constructor(private readonly store:UnifiedLinuxReservationStore,private readonly runtime:UnifiedLinuxRuntime){}
  assertScopeReserved(identity:EnvironmentIdentity):void {
    const e=this.leases.get(reservationIdentityKey(identity));
    if(!e || e.released)throw Error('RESERVATION_NOT_HELD');
    this.store.assertHeld(identity,e.lease);
  }
  async provision(identity:EnvironmentIdentity):Promise<void>{
    const key=reservationIdentityKey(identity);
    if(this.leases.has(key)||this.leases.size>=1024)throw Error('RESERVATION_CAPACITY');
    const lease=this.store.acquire(identity);
    const e={lease,released:false,busy:true}; this.leases.set(key,e);
    try{this.assertScopeReserved(identity); await this.runtime.provision(identity); this.assertScopeReserved(identity);}
    finally{e.busy=false;}
  }
  async inspect(identity:EnvironmentIdentity):Promise<'running'|'absent'|'unknown'>{
    try{
      const e=this.leases.get(reservationIdentityKey(identity));
      if(!e || e.busy)return 'unknown';
      if(e.released)return 'absent'; // previously verified cleanup of this exact ID
      this.assertScopeReserved(identity);
      const state=await this.runtime.inspect(identity);
      this.assertScopeReserved(identity);
      // Absence in Docker alone cannot release the lease. Force the manager
      // through explicit destroy, where lease release is durably committed.
      return state==='running'?'running':'unknown';
    }catch{return 'unknown';}
  }
  async openTerminal(identity:EnvironmentIdentity,program?:UnifiedPythonProgram):Promise<UnifiedLinuxTerminal>{
    this.assertScopeReserved(identity);
    const e=this.leases.get(reservationIdentityKey(identity));
    if(!e||e.busy||!this.runtime.openTerminal)throw Error('TERMINAL_RUNTIME_UNAVAILABLE');
    const terminal=await (program?this.runtime.openTerminal(identity,program):this.runtime.openTerminal(identity));
    try{this.assertScopeReserved(identity);if(e.busy)throw Error('RESERVATION_BUSY');return terminal;}
    catch(error){terminal.disconnect();throw error;}
  }
  async destroy(identity:EnvironmentIdentity):Promise<void>{
    const e=this.leases.get(reservationIdentityKey(identity));
    if(!e || e.busy)throw Error('RESERVATION_NOT_HELD');
    if(e.released)return;
    this.assertScopeReserved(identity); e.busy=true;
    try{
      if(await this.runtime.inspect(identity)!=='absent')await this.runtime.destroy(identity);
      if(await this.runtime.inspect(identity)!=='absent')throw Error('RESERVATION_CLEANUP_UNVERIFIED');
      this.store.releaseAfterVerifiedAbsence(identity,e.lease); e.released=true;
    }finally{e.busy=false;}
  }
}
