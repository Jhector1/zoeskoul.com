import { adminHostConfigForLab } from "./learningAdminSandbox.js";
/** Shared guest host configuration. Detached is an offline-only experimental
 * profile; the existing interactive launch keeps exactly its current policy. */
export function adminLabGuestHostConfig(volumeName:string, networkName:string|null, detached=false) {
  const base=adminHostConfigForLab();
  if(detached && (networkName!==null || base.NetworkMode!=="none"))throw new Error("DETACHED_GUEST_REQUIRES_OFFLINE");
  return {
    ...base,
    ...(networkName ? {NetworkMode:networkName} : {}),
    Mounts:[{Type:"volume" as const, Source:volumeName, Target:"/workspace", ReadOnly:false, VolumeOptions:{NoCopy:true} as import("dockerode").MountSettings["VolumeOptions"]}],
    ...(detached?{AutoRemove:false,RestartPolicy:{Name:"no" as const}}:{}),
  };
}
