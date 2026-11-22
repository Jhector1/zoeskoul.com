import { openUnifiedDockerTerminal } from "./unifiedLinuxDockerTerminal.js";
import type { EnvironmentIdentity } from './unifiedLinuxEnvironmentManager.js';
import { adminLabConfiguration, assertVerifiedAdminGrant, type VerifiedAdminGrant } from './learningAdminGrant.js';
import { assertAdminLabSwitch } from './learningAdminSwitch.js';
import { detachedAdminDockerOperations } from './adminLabDockerGuest.js';
import { adminResourceOperations } from './adminLabDockerResources.js';
import { verifyAdminSandboxImage } from './learningAdminSandbox.js';
import { docker } from '../docker/dockerClient.js';
import { offlineGuestIdentity, UnifiedLinuxOfflineRuntime } from './unifiedLinuxOfflineRuntime.js';

/** Composition factory for future controlled integration tests. No live callers.
 * Trusted callers must implement durable scope exclusion and readiness checks;
 * full disk quotas, revocation sweep and lifetime management remain blockers. */
export function createUnifiedLinuxOfflineDockerRuntime(deps: {
  authorization: (identity:EnvironmentIdentity)=>{grant:VerifiedAdminGrant;generation:number};
  assertScopeReserved: (identity:EnvironmentIdentity)=>Promise<void>;
  verifyReady: (identity:EnvironmentIdentity,containerId:string)=>Promise<void>;
}):UnifiedLinuxOfflineRuntime {
  return new UnifiedLinuxOfflineRuntime(identity=>{
    const {grant,generation}=deps.authorization(identity);
    assertVerifiedAdminGrant(grant,identity.scope.actorId);assertAdminLabSwitch(generation);
    const {image}=adminLabConfiguration();
    const guest=detachedAdminDockerOperations(offlineGuestIdentity(identity,image),grant,generation);
    return {image,guest,resources:adminResourceOperations(generation,identity.policy.limits.lifetimeMinutes*60_000,true),
      assertScopeReserved:async value=>{guest.assertAuthorized();await verifyAdminSandboxImage(docker,image);await deps.assertScopeReserved(value);guest.assertAuthorized();},
      openTerminal:openUnifiedDockerTerminal,
      verifyReady:deps.verifyReady};
  });
}


import { persistentEnvironmentSpec, type PersistentEnvironmentRecord } from './unifiedLinuxAdmission.js';
import { linuxCapabilities } from './unifiedLinuxPolicy.js';
import { executeAuthorizedWorkspace, type WorkspaceReadRequest, type WorkspaceReadResult } from './unifiedLinuxWorkspaceRead.js';
import type { UnifiedLinuxTerminal, UnifiedPythonProgram } from './unifiedLinuxEnvironmentManager.js';

/** Provider operations for the persistent controller. This implementation is
 * deliberately restricted to a private, offline, non-root developer pilot.
 * No quota claim, no production registration and no automatic destruction.
 * The caller owns the durable registry, lease, authorization and serialization. */
export interface PersistentLinuxProvider {
  inspect(record:PersistentEnvironmentRecord):Promise<'running'|'stopped'|'absent'|'unknown'>;
  create(record:PersistentEnvironmentRecord):Promise<string>;
  start(record:PersistentEnvironmentRecord):Promise<void>;
  stop(record:PersistentEnvironmentRecord):Promise<void>;
  workspace(record:PersistentEnvironmentRecord,request:WorkspaceReadRequest,authorized:()=>boolean):Promise<WorkspaceReadResult>;
  terminal(record:PersistentEnvironmentRecord,authorized:()=>boolean,program?:UnifiedPythonProgram):Promise<UnifiedLinuxTerminal>;
}
const persistentLabel='com.zoeskoul.learning.persistent-guest';
const scopeLabel='com.zoeskoul.learning.persistent-scope';
const generationLabel='com.zoeskoul.learning.persistent-generation';
const providerLabel='com.zoeskoul.learning.persistent-provider';
const pinnedPersistentImage='sha256:fda07294363c1d9b4cfeaf5bf974c7041311c6d157a631d1a81d1c012086f54f';
const noValues=(value:unknown)=>value==null||(typeof value==='object'&&Object.keys(value).length===0);
const normalizedCaps=(value:readonly string[]|undefined|null)=>(value??[]).map(v=>v.replace(/^CAP_/, '')).sort().join(',');
export function createPrivatePersistentDockerProvider(deps:{
  providerId:string;
  assertAuthority:(record:PersistentEnvironmentRecord)=>void;
  client?:typeof docker;
  openTerminal?:typeof openUnifiedDockerTerminal;
}):PersistentLinuxProvider {
  const client=deps.client??docker;
  const permit=(record:PersistentEnvironmentRecord)=>{
    if(process.env.NODE_ENV!=='development'||process.env.ZOESKOUL_LEARNING_PERSISTENT_PRIVATE_PROOF!=='true'||
       process.env.RUNNER_EXECUTION_POOL!=='zoeskoul-learning'||record.backend!=='docker'||record.providerId!==deps.providerId||
       !record.policy.capabilities.persistentStorage||linuxCapabilities.some(k=>k!=='persistentStorage'&&record.policy.capabilities[k])||
       record.policy.limits.memoryMiB>512||record.policy.limits.cpuMillicores>500||record.policy.limits.pids>64||
       record.policy.limits.maxTerminals>2||record.policy.limits.lifetimeMinutes>60)throw Error('PERSISTENT_PRIVATE_POLICY_DENIED');
    persistentEnvironmentSpec(record);deps.assertAuthority(record);
  };
  const labels=(record:PersistentEnvironmentRecord)=>{const s=persistentEnvironmentSpec(record);return {
    [persistentLabel]:'private-proof-v1',[scopeLabel]:s.scopeDigest,[generationLabel]:s.generation,[providerLabel]:s.providerId,
  };};
  const host=async(record:PersistentEnvironmentRecord)=>{permit(record);await verifyAdminSandboxImage(client,pinnedPersistentImage);permit(record);};
  const lookup=async(record:PersistentEnvironmentRecord)=>{
    permit(record);const spec=persistentEnvironmentSpec(record);
    try{return await client.getContainer(record.resourceId??spec.resourceName).inspect();}
    catch(error){
      if((error as {statusCode?:number})?.statusCode!==404)throw error;
      // Missing immutable ID is not proof of scope absence when the expected name
      // or another generation is occupied. Never adopt a replacement by name.
      const rows=await client.listContainers({all:true,filters:{label:[scopeLabel+'='+spec.scopeDigest]}});
      if(rows.length)throw Error('PERSISTENT_DOCKER_SCOPE_OCCUPIED');
      if(record.resourceId){try{await client.getContainer(spec.resourceName).inspect();}catch(e){if((e as {statusCode?:number})?.statusCode===404)return null;throw e;}throw Error('PERSISTENT_DOCKER_NAME_OCCUPIED');}
      return null;
    }
  };
  const exact=async(record:PersistentEnvironmentRecord)=>{
    const i=await lookup(record);permit(record);if(!i)return null;
    const s=persistentEnvironmentSpec(record),h=i.HostConfig,c=i.Config,l=record.policy.limits;
    const extra=h as unknown as Record<string,unknown>;
    if(i.Id!==record.resourceId||i.Name!=='/'+s.resourceName||i.Image!==pinnedPersistentImage||
       !Object.entries(labels(record)).every(([k,v])=>c.Labels?.[k]===v)||c.User!=='1000:1000'||
       c.WorkingDir!=='/workspace'||!Array.isArray(c.Entrypoint)||c.Entrypoint.length!==1||c.Entrypoint[0]!=='/bin/sleep'||!Array.isArray(c.Cmd)||c.Cmd.length!==1||c.Cmd[0]!=='infinity'||c.Tty!==false||c.OpenStdin!==false||
       !noValues(c.Volumes)||i.Mounts.length!==0||!noValues(h.Binds)||!noValues(extra.Mounts)||!noValues(extra.Tmpfs)||!noValues(extra.VolumesFrom)||
       h.NetworkMode!=='none'||h.Privileged!==false||h.AutoRemove!==false||h.ReadonlyRootfs!==false||
       !noValues(h.Devices)||!noValues(h.DeviceRequests)||!noValues(h.PortBindings)||h.PublishAllPorts||
       [extra.PidMode,extra.IpcMode,extra.UTSMode,extra.UsernsMode,extra.CgroupnsMode].includes('host')||h.RestartPolicy?.Name!=='no'||
       normalizedCaps(h.CapDrop)!=='ALL'||normalizedCaps(h.CapAdd)!=='CHOWN'||
       !Array.isArray(h.SecurityOpt)||h.SecurityOpt.length!==1||typeof h.SecurityOpt[0]!=='string'||!['no-new-privileges','no-new-privileges:true','no-new-privileges=true'].includes(h.SecurityOpt[0])||
       h.LogConfig?.Type!=='json-file'||h.LogConfig.Config?.['max-size']!=='1m'||h.LogConfig.Config?.['max-file']!=='2'||
       h.Memory!==l.memoryMiB*1048576||h.MemorySwap!==h.Memory||h.CpuPeriod!==100000||h.CpuQuota!==l.cpuMillicores*100||h.PidsLimit!==l.pids)
      throw Error('PERSISTENT_DOCKER_IDENTITY_UNVERIFIED');
    return i;
  };
  const running=async(record:PersistentEnvironmentRecord)=>{await host(record);const i=await exact(record);if(!i?.State.Running||i.State.Paused||i.State.Restarting)throw Error('PERSISTENT_DOCKER_NOT_RUNNING');return i;};
  const fixedExec=async(record:PersistentEnvironmentRecord,cmd:string,user:'0:0'|'sandbox')=>{
    const actual=await running(record);permit(record);
    const e=await client.getContainer(actual.Id).exec({Cmd:['/usr/bin/python3','-I','-S','-c',cmd],User:user,WorkingDir:'/',Tty:false,
      AttachStdout:true,AttachStderr:true,AttachStdin:false,Privileged:false});
    permit(record);const stream=await e.start({hijack:false,stdin:false});
    await new Promise<void>((resolve,reject)=>{let bytes=0,done=false;const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);if(error){stream.destroy();reject(error);}else resolve();};const timer=setTimeout(()=>finish(Error('PERSISTENT_BOOT_TIMEOUT')),8000);stream.on('data',(part:Buffer)=>{bytes+=part.length;if(bytes>16384)finish(Error('PERSISTENT_BOOT_OUTPUT_LIMIT'));});stream.once('end',()=>finish());stream.once('error',()=>finish(Error('PERSISTENT_BOOT_STREAM')));stream.once('close',()=>finish(Error('PERSISTENT_BOOT_CLOSED')));});
    const status=await e.inspect();permit(record);if(status.ContainerID!==actual.Id||status.Running!==false||status.ExitCode!==0)throw Error('PERSISTENT_BOOT_UNVERIFIED');
  };
  const inspect=async(record:PersistentEnvironmentRecord):Promise<'running'|'stopped'|'absent'|'unknown'>=>{
    try{await host(record);const i=await exact(record);if(!i)return 'absent';if(i.State.Paused||i.State.Restarting||i.State.Dead)return 'unknown';return i.State.Running?'running':['created','exited'].includes(i.State.Status)?'stopped':'unknown';}catch{return 'unknown';}
  };
  return {
    inspect,
    async create(record){
      await host(record);if(record.state!=='allocating'||record.resourceId!==null||await lookup(record)!==null)throw Error('PERSISTENT_DOCKER_CREATE_DENIED');
      // A second generation for this scope must not allocate alongside an existing resource.
      const s=persistentEnvironmentSpec(record), matches=await client.listContainers({all:true,filters:{label:[scopeLabel+'='+s.scopeDigest]}});
      if(matches.length)throw Error('PERSISTENT_DOCKER_SCOPE_OCCUPIED');permit(record);
      const l=record.policy.limits;
      const container=await client.createContainer({name:s.resourceName,Image:pinnedPersistentImage,Labels:labels(record),
        User:'1000:1000',WorkingDir:'/workspace',Entrypoint:['/bin/sleep'],Cmd:['infinity'],Tty:false,OpenStdin:false,StdinOnce:false,
        AttachStdin:false,AttachStdout:false,AttachStderr:false,HostConfig:{NetworkMode:'none',Privileged:false,ReadonlyRootfs:false,
          CapDrop:['ALL'],CapAdd:['CHOWN'],SecurityOpt:['no-new-privileges'],AutoRemove:false,RestartPolicy:{Name:'no'},
          Memory:l.memoryMiB*1048576,MemorySwap:l.memoryMiB*1048576,CpuPeriod:100000,CpuQuota:l.cpuMillicores*100,PidsLimit:l.pids,
          LogConfig:{Type:'json-file',Config:{'max-size':'1m','max-file':'2'}}}});
      const allocated={...record,resourceId:container.id};
      if(!/^[a-f0-9]{64}$/.test(container.id)||await inspect(allocated)!=='stopped')throw Error('PERSISTENT_DOCKER_ALLOCATION_UNVERIFIED');
      return container.id;
    },
    async start(record){
      if(record.state!=='starting'||await inspect(record)!=='stopped'||!record.resourceId)throw Error('PERSISTENT_DOCKER_START_DENIED');
      const before=await exact(record);if(!before)throw Error('PERSISTENT_DOCKER_START_DENIED');
      const firstBoot=before.State.Status==='created';
      permit(record);await client.getContainer(record.resourceId).start();
      await running(record);
      // Only the initial, never-started, pinned image may receive this fixed root
      // initialization. No recursive chown, sudo bootstrap or credential files.
      if(firstBoot)await fixedExec(record,`import os,pwd,stat
assert os.getuid()==0
u=pwd.getpwuid(1000)
assert u.pw_name=='sandbox' and u.pw_dir in ('/workspace','/home/sandbox')
for p in dict.fromkeys(('/workspace',u.pw_dir)):
    s=os.lstat(p)
    assert stat.S_ISDIR(s.st_mode)
    os.chown(p,1000,1000)
`, '0:0');
      await fixedExec(record,`import os,pwd,stat
u=pwd.getpwuid(1000)
assert os.getuid()==1000 and u.pw_name=='sandbox' and u.pw_dir in ('/workspace','/home/sandbox')
for p in dict.fromkeys(('/workspace',u.pw_dir)):
    s=os.lstat(p)
    assert stat.S_ISDIR(s.st_mode) and s.st_uid==1000 and os.access(p,os.W_OK)
assert open('/proc/self/status').read().split('NoNewPrivs:')[1].splitlines()[0].strip()=='1'
`, 'sandbox');
    },
    async stop(record){
      if(record.state!=='stopping'||!record.resourceId||await inspect(record)!=='running')throw Error('PERSISTENT_DOCKER_STOP_DENIED');
      permit(record);await client.getContainer(record.resourceId).stop({t:10});
      if(await inspect(record)!=='stopped')throw Error('PERSISTENT_DOCKER_STOP_UNVERIFIED');
    },
    async workspace(record,request,authorized){
      const deny={ok:false as const,reason:'UNIFIED_WORKSPACE_UNAVAILABLE'};
      try{if(record.state!=='running'||!authorized())return deny;const i=await running(record);
        const result=await executeAuthorizedWorkspace(client.getContainer(i.Id),i.Id,request,()=>{try{permit(record);return authorized();}catch{return false;}});
        if(!authorized()||await inspect(record)!=='running')return deny;return result;
      }catch{return deny;}
    },
    async terminal(record,authorized,program){
      // A controller must own the slot and serialize stop/revocation. No direct browser caller.
      if(record.state!=='running'||(!deps.openTerminal&&client!==docker))throw Error('PERSISTENT_TERMINAL_UNAVAILABLE');
      const authorize=async()=>{if(!authorized())throw Error('PERSISTENT_TERMINAL_DENIED');await running(record);if(!authorized())throw Error('PERSISTENT_TERMINAL_DENIED');};
      await authorize();return (deps.openTerminal??openUnifiedDockerTerminal)(record.resourceId!,authorize,program);
    },
  };
}
