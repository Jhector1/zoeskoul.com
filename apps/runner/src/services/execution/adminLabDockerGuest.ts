/** Internal Docker binding for the U2B2 offline detached guest experiment.
 * Deliberately no route, scheduler, or live environment manager instantiation.
 * Before activation: durable reservation, revocation/expiry, readiness and
 * resource limits must be integrated. Uses the existing private admin image. */
import { docker } from "../docker/dockerClient.js";
import { adminLabConfiguration, assertVerifiedAdminGrant, type VerifiedAdminGrant } from "./learningAdminGrant.js";
import { assertAdminLabSwitch } from "./learningAdminSwitch.js";
import { verifyAdminSandboxImage, adminLabSessionIsolationEnabled } from "./learningAdminSandbox.js";
import { verifyAdminWorkspaceVolume } from "./adminWorkspaceVolume.js";
import { adminLabGuestHostConfig } from "./adminLabGuestHostConfig.js";
import { detachedGuestSpec, type DetachedGuestIdentity, type DetachedGuestOperations } from "./adminLabGuestLifecycle.js";
/** Read-only inspection; never grants permission to attach or remove. */
export const inspectDetachedAdminDockerGuest:DetachedGuestOperations["inspect"]=async(key)=>{
      const info=await docker.info();
      if(!(info.SecurityOptions??[]).includes("name=rootless") || !info.DockerRootDir || info.DockerRootDir==="/var/lib/docker")throw new Error("DETACHED_GUEST_EXECUTOR_UNVERIFIED");
      try {
        const i=await docker.getContainer(key).inspect();
        return {id:i.Id,name:i.Name,image:i.Image,labels:i.Config.Labels??{},running:i.State.Running===true,
          network:i.HostConfig.NetworkMode??"",privileged:i.HostConfig.Privileged!==false,autoRemove:i.HostConfig.AutoRemove!==false,
          user:i.Config.User??"",tty:i.Config.Tty!==false,openStdin:i.Config.OpenStdin!==false,
          volumeNames:i.Mounts.filter(m=>m.Type==="volume" && m.Destination==="/workspace").map(m=>m.Name??""),
          hasBind:i.Mounts.some(m=>m.Type!=="volume" || m.Destination!=="/workspace") || !!i.HostConfig.Binds?.length};
      } catch(e) {if((e as {statusCode?:number})?.statusCode===404)return null;throw e;}
};
export function detachedAdminDockerOperations(identity:DetachedGuestIdentity, grant:VerifiedAdminGrant, generation:number):DetachedGuestOperations {
  identity=Object.freeze({...identity});
  const spec=detachedGuestSpec(identity);
  const authorized=()=>{
    if(process.env.ZOESKOUL_LEARNING_UNIFIED_DETACHED_DEV!=="true" ||
       process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE!=="development")throw new Error("DETACHED_GUEST_DISABLED");
    assertVerifiedAdminGrant(grant,identity.ownerKey); assertAdminLabSwitch(generation);
    if(grant.topicSlug!=="full-privileges" || adminLabConfiguration().image!==identity.image || adminLabSessionIsolationEnabled())throw new Error("DETACHED_GUEST_POLICY_DENIED");
    adminLabGuestHostConfig(spec.volume,null,true);
  };
  return {
    assertAuthorized:authorized,
    verifyPrerequisites:async()=>{authorized();await verifyAdminSandboxImage(docker,identity.image);await verifyAdminWorkspaceVolume(spec.volume,identity.sessionId);authorized();},
    inspect:inspectDetachedAdminDockerGuest,
    create:async()=>{authorized();const guest=await docker.createContainer({name:spec.name,Image:spec.image,Labels:spec.labels,
      User:"0:0",WorkingDir:"/workspace",Cmd:spec.command,Tty:false,OpenStdin:false,StdinOnce:false,
      AttachStdin:false,AttachStdout:false,AttachStderr:false,HostConfig:adminLabGuestHostConfig(spec.volume,null,true)});return guest.id;},
    start:async(id)=>{authorized();await docker.getContainer(id).start();},
    remove:async(id)=>{await docker.getContainer(id).remove({force:true});},
  };
}
