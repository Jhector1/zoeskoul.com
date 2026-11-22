import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readSync, opendirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { environmentScopeKey } from './unifiedLinuxAdmission.js';
import { isLinuxPolicy, linuxCapabilities, linuxLimits } from './unifiedLinuxPolicy.js';
import type { EnvironmentIdentity } from './unifiedLinuxEnvironmentManager.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const MAX_BYTES=8192;
export function reservationIdentityKey(value:EnvironmentIdentity):string {
  if(!value.id.startsWith('env_') || !uuid.test(value.id.slice(4)) || !isLinuxPolicy(value.policy))throw Error('INVALID_RESERVATION_IDENTITY');
  return JSON.stringify([value.id,environmentScopeKey(value.scope),...linuxCapabilities.map(k=>value.policy.capabilities[k]),...linuxLimits.map(k=>value.policy.limits[k])]);
}
type Lease=Readonly<{token:string; identityKey:string}>;
/** Private host directory on a durable local filesystem, shared by all unified
 * coordinators for this daemon. Never mount it inside a guest. O_EXCL is the
 * cross-process exclusion boundary. A torn file is deliberately a blocker.
 * Only the creating coordinator receives the lease. Restart recovery and
 * operator reconciliation are intentionally NOT implemented here. */
export class UnifiedLinuxReservationStore {
  private readonly root:string;
  constructor(root:string){
    if(!isAbsolute(root) || resolve(root)!==root)throw Error('RESERVATION_ROOT_INVALID');
    this.root=root; this.checkRoot();
  }
  private checkRoot():void {
    const s=lstatSync(this.root);
    if(realpathSync(this.root)!==this.root || !s.isDirectory() || s.uid!==process.getuid?.() || (s.mode&0o777)!==0o700)throw Error('RESERVATION_ROOT_UNSAFE');
  }
  private path(identity:EnvironmentIdentity):string {
    this.checkRoot(); reservationIdentityKey(identity);
    return join(this.root,sha(environmentScopeKey(identity.scope))+'.json');
  }
  private syncRoot():void {
    const fd=openSync(this.root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{fsyncSync(fd);}finally{closeSync(fd);}
  }
  acquire(identity:EnvironmentIdentity):Lease {
    const path=this.path(identity), identityKey=reservationIdentityKey(identity), token=randomUUID();
    // Keep the complete scope, policy and ID for later trusted reconciliation.
    const bytes=JSON.stringify({version:1,token,identity,identityKey})+'\n';
    if(Buffer.byteLength(bytes)>MAX_BYTES)throw Error('RESERVATION_TOO_LARGE');
    const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    // On ANY failure do not unlink: the reservation may have reached disk.
    try{writeFileSync(fd,bytes,'utf8');fsyncSync(fd);}finally{closeSync(fd);}
    this.syncRoot();
    return Object.freeze({token,identityKey});
  }
  assertHeld(identity:EnvironmentIdentity, lease:Lease):void {
    const path=this.path(identity), expected=reservationIdentityKey(identity);
    if(lease.identityKey!==expected || !uuid.test(lease.token))throw Error('RESERVATION_LEASE_MISMATCH');
    const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const s=fstatSync(fd);
      if(!s.isFile() || s.uid!==process.getuid?.() || (s.mode&0o777)!==0o600 || s.nlink!==1 || s.size<1 || s.size>MAX_BYTES)throw Error('RESERVATION_FILE_UNSAFE');
      const value=JSON.parse(readFileSync(fd,'utf8'));
      if(value.version!==1 || value.token!==lease.token || value.identityKey!==expected || reservationIdentityKey(value.identity)!==expected)throw Error('RESERVATION_LEASE_MISMATCH');
    }finally{closeSync(fd);}
  }
  /** Read-only inventory. Never exposes lease tokens or acquires ownership.
   * Must be used while all provisioning coordinators are quiesced. */
  inventory():readonly EnvironmentIdentity[] {
    this.checkRoot();
    const dir=opendirSync(this.root), result:EnvironmentIdentity[]=[], ids=new Set<string>();
    try {
      for(let item=dir.readSync();item;item=dir.readSync()) {
        if(result.length>=1024 || !/^[a-f0-9]{64}\.json$/.test(item.name))throw Error('RESERVATION_INVENTORY_UNSAFE');
        const fd=openSync(join(this.root,item.name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
        try {
          const st=fstatSync(fd);
          if(!st.isFile()||st.uid!==process.getuid?.()||(st.mode&0o777)!==0o600||st.nlink!==1||st.size<1||st.size>MAX_BYTES)throw Error('RESERVATION_FILE_UNSAFE');
          const bytes=Buffer.alloc(MAX_BYTES+1);let total=0;
          while(total<bytes.length){const n=readSync(fd,bytes,total,bytes.length-total,null);if(n===0)break;total+=n;}
          if(total!==st.size || total>MAX_BYTES)throw Error('RESERVATION_INVENTORY_CHANGED');
          const value=JSON.parse(bytes.subarray(0,total).toString('utf8'));
          const identity:EnvironmentIdentity=value.identity;
          if(value.version!==1 || typeof value.token!=='string'||!uuid.test(value.token)||value.identityKey!==reservationIdentityKey(identity)||
            item.name!==sha(environmentScopeKey(identity.scope))+'.json'||ids.has(identity.id))throw Error('RESERVATION_INVENTORY_UNSAFE');
          this.assertHeld(identity,{token:value.token,identityKey:value.identityKey});
          ids.add(identity.id);
          result.push(Object.freeze({id:identity.id,scope:Object.freeze({tenantId:identity.scope.tenantId,actorId:identity.scope.actorId,workspaceId:identity.scope.workspaceId}),policy:Object.freeze({capabilities:Object.freeze({...identity.policy.capabilities}),limits:Object.freeze({...identity.policy.limits})})}));
        }finally{closeSync(fd);}
      }
    }finally{dir.closeSync();}
    this.checkRoot();return Object.freeze(result.sort((a,b)=>a.id.localeCompare(b.id)));
  }
  /** Internal only: caller must hold the original lease, serialize operations
   * and have just verified that all associated Docker resources are absent. */
  releaseAfterVerifiedAbsence(identity:EnvironmentIdentity,lease:Lease):void {
    this.assertHeld(identity,lease);
    unlinkSync(this.path(identity)); this.syncRoot();
  }
}
