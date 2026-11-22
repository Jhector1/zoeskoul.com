/** Internal detached guest primitive. This is not a session admission path.
 * Caller must reserve identity and prepare a verified private volume first.
 * No PTY or browser endpoint owns this lifecycle. */
export type DetachedGuestIdentity = Readonly<{sessionId:string; ownerKey:string; image:string}>;
export const detachedGuestMarker = "com.zoeskoul.learning.unified-guest";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function detachedGuestSpec(identity:DetachedGuestIdentity) {
  const {sessionId,ownerKey,image}=identity;
  if(!sessionId.startsWith("sess_") || !uuid.test(sessionId.slice(5)) ||
     !/^u:[a-f0-9]{64}$/.test(ownerKey) || !/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("INVALID_DETACHED_GUEST_IDENTITY");
  return { name:`zoeskoul_${sessionId}`, image, volume:`zoeskoul-admin-ws-${sessionId}`,
    labels:{"com.zoeskoul.runner":"true","com.zoeskoul.runner.session":sessionId,
      "com.zoeskoul.runner.owner":ownerKey.slice(0,64),"com.zoeskoul.learning.unified-owner":ownerKey,"com.zoeskoul.runner.purpose":"learn",
      "com.zoeskoul.runner.profile":"learning-admin-disposable-v1",
      "com.zoeskoul.runner.lab-mode":"admin",[detachedGuestMarker]:"u2b2"},
    command:["/usr/bin/sleep","infinity"],
  };
}
export type DetachedGuestInspection = {id:string; name:string; image:string; labels:Record<string,string>;
  running:boolean; network:string; privileged:boolean; volumeNames:string[]; hasBind:boolean;
  autoRemove:boolean; user:string; tty:boolean; openStdin:boolean};
export type DetachedGuestOperations = {
  assertAuthorized:()=>void; verifyPrerequisites:()=>Promise<void>;
  inspect:(nameOrId:string)=>Promise<DetachedGuestInspection|null>;
  create:()=>Promise<string>; start:(id:string)=>Promise<void>; remove:(id:string)=>Promise<void>;
};
function matches(identity:DetachedGuestIdentity, guest:DetachedGuestInspection):boolean {
  const expected=detachedGuestSpec(identity);
  return /^[a-f0-9]{64}$/.test(guest.id) && guest.name===`/${expected.name}` && guest.image===expected.image &&
    Object.entries(expected.labels).every(([key,value])=>guest.labels[key]===value) &&
    guest.network==="none" && guest.privileged===false && !guest.hasBind &&
    guest.volumeNames.length===1 && guest.volumeNames[0]===expected.volume && guest.autoRemove===false &&
    guest.user==="0:0" && guest.tty===false && guest.openStdin===false;
}
/** Record expected name before creation. On failure retain the reservation;
 * the caller may reconcile by name after a lost create acknowledgement. */
export async function provisionDetachedGuest(identity:DetachedGuestIdentity, ops:DetachedGuestOperations):Promise<string> {
  const spec=detachedGuestSpec(identity);
  ops.assertAuthorized(); await ops.verifyPrerequisites(); ops.assertAuthorized();
  if(await ops.inspect(spec.name)!==null)throw new Error("DETACHED_GUEST_NAME_OCCUPIED");
  ops.assertAuthorized(); const id=await ops.create();
  if(!/^[a-f0-9]{64}$/.test(id))throw new Error("DETACHED_GUEST_CREATE_UNVERIFIED");
  ops.assertAuthorized(); const created=await ops.inspect(id);
  if(!created || created.id!==id || !matches(identity,created) || created.running)throw new Error("DETACHED_GUEST_CREATE_UNVERIFIED");
  ops.assertAuthorized(); await ops.start(id); ops.assertAuthorized();
  const running=await ops.inspect(id);
  if(!running || running.id!==id || !matches(identity,running) || !running.running)throw new Error("DETACHED_GUEST_START_UNVERIFIED");
  ops.assertAuthorized(); return id;
}
export async function inspectDetachedGuest(identity:DetachedGuestIdentity, ops:Pick<DetachedGuestOperations,"inspect">):Promise<"running"|"absent"|"unknown"> {
  const spec=detachedGuestSpec(identity);
  try { const value=await ops.inspect(spec.name); return value===null?"absent":matches(identity,value)&&value.running?"running":"unknown"; }
  catch { return "unknown"; }
}
/** Explicit end or authorized cleanup only, under the lifecycle reservation.
 * Never evict by capacity, disconnect or browser window. Only removes a
 * matching guest. Volume/network teardown belongs to the resource manager. */
export async function destroyDetachedGuest(identity:DetachedGuestIdentity, ops:Pick<DetachedGuestOperations,"inspect"|"remove">):Promise<void> {
  const spec=detachedGuestSpec(identity); const found=await ops.inspect(spec.name);
  if(found===null)return;
  if(!matches(identity,found))throw new Error("DETACHED_GUEST_OWNER_UNVERIFIED");
  await ops.remove(found.id);
  if(await ops.inspect(found.id)!==null || await ops.inspect(spec.name)!==null)throw new Error("DETACHED_GUEST_CLEANUP_UNVERIFIED");
}
