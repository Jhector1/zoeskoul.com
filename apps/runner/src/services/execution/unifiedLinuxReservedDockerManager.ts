import { randomUUID } from 'node:crypto';
import { createUnifiedLinuxOfflineDockerRuntime } from './unifiedLinuxOfflineDockerRuntime.js';
import { UnifiedLinuxEnvironmentManager, type EnvironmentIdentity } from './unifiedLinuxEnvironmentManager.js';
import { UnifiedLinuxReservationStore } from './unifiedLinuxReservationStore.js';
import { UnifiedLinuxReservedRuntime } from './unifiedLinuxReservedRuntime.js';

type Deps=Parameters<typeof createUnifiedLinuxOfflineDockerRuntime>[0];
/** Experimental composition only; do not register an API route or instantiate
 * during Runner startup yet. Legacy scope exclusion, host readiness, expiry,
 * revocation and full runtime quotas remain mandatory external prerequisites. */
export function createUnifiedLinuxReservedDockerManager(root:string, deps:Deps, onReservationGuard?:(check:(identity:EnvironmentIdentity)=>void)=>void):UnifiedLinuxEnvironmentManager {
  if (process.env.ZOESKOUL_LEARNING_UNIFIED_RESERVATION_ROOT !== root) throw Error("UNIFIED_RESERVATION_ROOT_NOT_CONFIGURED");
  const store=new UnifiedLinuxReservationStore(root);
  const runtime=createUnifiedLinuxOfflineDockerRuntime({...deps,assertScopeReserved:async(identity:EnvironmentIdentity)=>{
    guarded.assertScopeReserved(identity);
    await deps.assertScopeReserved(identity); // existing trusted legacy exclusion
    guarded.assertScopeReserved(identity);
  }});
  const guarded=new UnifiedLinuxReservedRuntime(store,runtime);
  onReservationGuard?.(identity=>guarded.assertScopeReserved(identity));
  return new UnifiedLinuxEnvironmentManager(guarded,()=>`env_${randomUUID()}`);
}
