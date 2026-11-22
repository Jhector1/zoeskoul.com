import { docker } from '../docker/dockerClient.js';
import { inspectDetachedAdminDockerGuest } from './adminLabDockerGuest.js';
import { verifyAdminSandboxImage } from './learningAdminSandbox.js';
import { adminLabConfiguration } from './learningAdminGrant.js';
import { validateAdminVolumeInspect } from './adminWorkspaceVolume.js';
import { UnifiedLinuxReservationStore } from './unifiedLinuxReservationStore.js';
import { reconcileUnifiedLinuxReservations } from './unifiedLinuxReconciliation.js';

/** Internal development-only diagnostics, intentionally not invoked from
 * startup or HTTP. Caller must quiesce all coordinators and skip old reapers.
 * No grant is minted, no environment is adopted, and no resource is modified. */
export async function inspectUnifiedLinuxDockerReservations(root:string){
  if(process.env.RUNNER_EXECUTION_POOL!=='zoeskoul-learning'||process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE!=='development')throw Error('UNIFIED_RECONCILIATION_DISABLED');
  const image=adminLabConfiguration().image;
  return reconcileUnifiedLinuxReservations(new UnifiedLinuxReservationStore(root),{
    image,inspect:inspectDetachedAdminDockerGuest,
    verifyImage:async()=>{await verifyAdminSandboxImage(docker,image);},
    volume:async(name,sessionId)=>{
      try{const info=await docker.getVolume(name).inspect();validateAdminVolumeInspect(info,sessionId);return 'verified';}
      catch(e){return (e as {statusCode?:number})?.statusCode===404?'absent':'unknown';}
    },
  });
}
