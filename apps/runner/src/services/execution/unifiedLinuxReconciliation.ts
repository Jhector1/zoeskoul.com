import { reservationIdentityKey, UnifiedLinuxReservationStore } from './unifiedLinuxReservationStore.js';
import { assertOfflinePolicy, offlineGuestIdentity } from './unifiedLinuxOfflineRuntime.js';
import { detachedGuestSpec, inspectDetachedGuest, type DetachedGuestOperations } from './adminLabGuestLifecycle.js';
import type { EnvironmentIdentity } from './unifiedLinuxEnvironmentManager.js';

type State='running_candidate'|'no_guest_or_volume'|'volume_without_guest'|'unverified';
export type ReconciliationRecord=Readonly<{environmentId:string;state:State}>;
export type ReconciliationProbe=Readonly<{
  image:string;
  inspect:DetachedGuestOperations['inspect'];
  volume:(name:string,sessionId:string)=>Promise<'verified'|'absent'|'unknown'>;
  verifyImage:()=>Promise<void>;
}>;
/** Diagnostic only. Run with ALL coordinators quiesced and before destructive
 * startup cleanup. No lease adoption, no expiry inference, no mutations or
 * automatic cleanup. The v1 reservation lacks original image/creation evidence.
 * Even a matching running guest is ONLY a candidate for further investigation. */
export async function reconcileUnifiedLinuxReservations(store:UnifiedLinuxReservationStore,probe:ReconciliationProbe):Promise<readonly ReconciliationRecord[]> {
  const before=store.inventory();
  const result:ReconciliationRecord[]=[];
  for(const identity of before){
    let state:State='unverified';
    try {
      assertOfflinePolicy(identity);
      const guest=offlineGuestIdentity(identity,probe.image),spec=detachedGuestSpec(guest);
      await probe.verifyImage();
      const first=await probe.inspect(spec.name);
      const volume=await probe.volume(spec.volume,guest.sessionId);
      const status=await inspectDetachedGuest(guest,{inspect:async()=>first});
      const last=await probe.inspect(spec.name);
      if(first===null&&last===null&&status==='absent') {
        if(volume==='absent')state='no_guest_or_volume';
        else if(volume==='verified')state='volume_without_guest';
      }else if(first&&last&&first.id===last.id&&first.running&&last.running&&status==='running'&&volume==='verified'&&
        await inspectDetachedGuest(guest,{inspect:async()=>last})==='running')state='running_candidate';
    }catch{/* Unavailable, changed or foreign evidence remains unverified. */}
    result.push(Object.freeze({environmentId:identity.id,state}));
  }
  const fingerprint=(rows:readonly EnvironmentIdentity[])=>JSON.stringify(rows.map(reservationIdentityKey));
  if(fingerprint(before)!==fingerprint(store.inventory()))throw Error('RESERVATION_INVENTORY_CHANGED');
  return Object.freeze(result);
}
