import { UnifiedLinuxBrowserAdmission } from './unifiedLinuxBrowserAdmission.js';
import { randomBytes, createHmac, randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { describe,it,expect } from 'vitest';
import { UnifiedLinuxAdmissionService, type UnifiedRuntimeAuthority } from './unifiedLinuxAdmissionService.js';
import { UnifiedLinuxEnvironmentManager, type EnvironmentIdentity, type UnifiedLinuxRuntime } from './unifiedLinuxEnvironmentManager.js';
import { linuxCapabilities,type LinuxPolicy } from './unifiedLinuxPolicy.js';
import { setAdminLabSwitch } from './learningAdminSwitch.js';
const scope={tenantId:'tenant',actorId:'u:'+'a'.repeat(64),workspaceId:'work'};
const policy:LinuxPolicy={capabilities:Object.fromEntries(linuxCapabilities.map(k=>[k,k==='administrator'||k==='reset'])) as LinuxPolicy['capabilities'],limits:{maxTerminals:2,memoryMiB:192,cpuMillicores:500,pids:48,diskMiB:64,idleMinutes:5,lifetimeMinutes:10}};
function context(s=scope,p=policy){return {scope:s,policy:{platform:policy,organization:policy,course:policy,entitlement:policy,verifiedRuntime:policy,requested:p}};}
const vars={ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED:'true',ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET:'z'.repeat(64),ZOESKOUL_LEARNING_ADMIN_LAB_IMAGE:'sha256:'+'b'.repeat(64),RUNNER_EXECUTION_POOL:'zoeskoul-learning',ZOESKOUL_LEARNING_UNIFIED_DETACHED_DEV:'true',ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE:'development'};
function token(actor=scope.actorId,topic='full-privileges'){
 const iat=Math.floor(Date.now()/1000),p=Buffer.from(JSON.stringify({v:1,aud:'zoeskoul-learning-admin',actorKey:actor,courseSlug:'linux-files-permissions-users',topicSlug:topic,iat,exp:iat+45,nonce:randomBytes(16).toString('hex')})).toString('base64url');return p+'.'+createHmac('sha256',vars.ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET).update(p).digest('base64url');
}
function fixture(limit=2,privatePilotLifetimeMinutes?:60){
 const originals=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]]));Object.assign(process.env,vars);setAdminLabSwitch(true);
 let now=1000,allowed=true,held=true,creates=0,destroys=0,fail=false,starts=0;let auth!:UnifiedRuntimeAuthority;let live=new Set<string>();
 let manager!:UnifiedLinuxEnvironmentManager;let driver:UnifiedLinuxRuntime={provision:async e=>{auth(e);creates++;live.add(e.id);},inspect:async e=>live.has(e.id)?'running':'absent',destroy:async e=>{destroys++;if(fail)throw Error('blocked');live.delete(e.id);},openTerminal:async e=>{auth(e);starts++;return {stream:new PassThrough(),resize:async()=>{},disconnect:()=>{},exited:async()=>false};}};
 const restore=()=>{setAdminLabSwitch(false);for(const [k,v] of Object.entries(originals)){if(v===undefined)delete process.env[k];else process.env[k]=v;}};
 let service:UnifiedLinuxAdmissionService;
 try{service=new UnifiedLinuxAdmissionService({maxEnvironments:limit,privatePilotLifetimeMinutes,now:()=>now,scopeAllowed:()=>allowed,assertScopeHeld:()=>{if(!held)throw Error('lease lost');},createManager:a=>{auth=a;manager=new UnifiedLinuxEnvironmentManager(driver,()=>`env_${randomUUID()}`,()=>now);return manager;}});}catch(error){restore();throw error;}
 return {service,driver,manager,auth,stop:restore,counts:()=>({creates,destroys,starts}),allow:(v:boolean)=>{allowed=v;},hold:(v:boolean)=>{held=v;},advance:(ms=600000)=>{now+=ms;},fail:(v:boolean)=>{fail=v;}};
}
async function run(f:(a:ReturnType<typeof fixture>)=>Promise<void>,limit=2){const x=fixture(limit);try{await f(x);}finally{x.stop();}}
async function open(f:ReturnType<typeof fixture>){const r=await f.service.open(context(),token());if(!r.ok)throw Error(r.reason);return r.environment.id;}
async function terminal(f:ReturnType<typeof fixture>,id:string){const r=await f.service.openTerminal(scope,id);if(!r.ok)throw Error(r.reason);return r.terminalId;}
describe('trusted unified admission composition',()=>{
 it('private pilot allows 60 minutes only for one trusted development environment',async()=>{
  const extended={...policy,limits:{...policy.limits,lifetimeMinutes:60}};
  const exact={scope,policy:{platform:extended,organization:extended,course:extended,entitlement:extended,verifiedRuntime:extended,requested:extended}};
  const f=fixture(1,60);try{
   const opened=await f.service.open(exact,token());if(!opened.ok)throw Error(opened.reason);
   f.advance(3_599_999);expect(f.service.authorizeEnvironment(scope,opened.environment.id)).toBe(true);
   expect((await f.service.open(exact,token())).ok).toBe(true);
   f.advance(1);expect(f.service.authorizeEnvironment(scope,opened.environment.id)).toBe(false);
   expect((await f.service.sweep()).ok).toBe(true);expect(f.counts().destroys).toBe(1);
  }finally{f.stop();}
 });
 it('private pilot rejects a policy above 60 minutes',async()=>{
  const p={...policy,limits:{...policy.limits,lifetimeMinutes:61}};const f=fixture(1,60);try{
   const r=await f.service.open({scope,policy:{platform:p,organization:p,course:p,entitlement:p,verifiedRuntime:p,requested:p}},token());
   expect(r).toMatchObject({ok:false,reason:'UNIFIED_OFFLINE_POLICY_UNSUPPORTED'});expect(f.counts().creates).toBe(0);
  }finally{f.stop();}
 });
 it('extended pilot cannot allocate multiple environments or accept a different cap',()=>{
  expect(()=>fixture(2,60)).toThrow('UNIFIED_PRIVATE_PILOT_LIMIT_INVALID');
  expect(()=>fixture(1,61 as 60)).toThrow('UNIFIED_PRIVATE_PILOT_LIMIT_INVALID');
 });
 it('valid grant creates and resumes same environment',()=>run(async f=>{const id=await open(f);expect(await open(f)).toBe(id);expect(f.counts().creates).toBe(1);}));
 it('rejects forged or foreign actor grants',()=>run(async f=>{expect((await f.service.open(context(),'bad')).ok).toBe(false);expect((await f.service.open(context(),token('other'))).ok).toBe(false);expect(f.counts().creates).toBe(0);}));
 it('rejects replay of one-time launch token',()=>run(async f=>{const t=token();expect((await f.service.open(context(),t)).ok).toBe(true);expect((await f.service.open(context(),t)).ok).toBe(false);}));
 it('rejects lesson-specific grants for global environment',()=>run(async f=>{expect((await f.service.open(context(),token(scope.actorId,'sudo-root-concepts'))).ok).toBe(false);expect(f.counts().creates).toBe(0);}));
 it('disabled deployment cannot allocate',()=>run(async f=>{delete process.env.ZOESKOUL_LEARNING_UNIFIED_DETACHED_DEV;expect((await f.service.open(context(),token())).ok).toBe(false);expect(f.counts().creates).toBe(0);}));
 it('denied trusted scope cannot allocate',()=>run(async f=>{f.allow(false);expect((await f.service.open(context(),token())).ok).toBe(false);expect(f.counts().creates).toBe(0);}));
 it('denies unsupported non-admin configuration',()=>run(async f=>{expect((await f.service.open(context(scope,{...policy,capabilities:{...policy.capabilities,administrator:false}}),token())).ok).toBe(false);expect(f.counts().creates).toBe(0);}));
 it('prevents same actor allocating a competing workspace',()=>run(async f=>{await open(f);expect(await f.service.open(context({...scope,workspaceId:'other'}),token())).toMatchObject({ok:false,reason:'UNIFIED_ACTOR_SCOPE_CONFLICT'});}));
 it('bounds concurrent environments',()=>run(async f=>{await open(f);const other={...scope,actorId:'u:'+'c'.repeat(64)};expect(await f.service.open(context(other),token(other.actorId))).toMatchObject({ok:false,reason:'UNIFIED_ENVIRONMENT_LIMIT'});},1));
 it('serializes concurrent admission',()=>run(async f=>{const [a,b]=await Promise.all([f.service.open(context(),token()),f.service.open(context(),token())]);expect(a.ok&&b.ok).toBe(true);expect(f.counts().creates).toBe(1);}));
 it('rejects changed policy rather than replacing work',()=>run(async f=>{await open(f);expect((await f.service.open(context(scope,{...policy,limits:{...policy.limits,maxTerminals:1}}),token())).ok).toBe(false);expect(f.counts()).toEqual({creates:1,destroys:0,starts:0});}));
 it('opens two terminals and enforces scoped reattach',()=>run(async f=>{const id=await open(f),a=await terminal(f,id),b=await terminal(f,id);expect(a===b).toBe(false);expect(f.service.authorizeAttach(scope,id,a)).toBe(true);expect(f.service.authorizeAttach({...scope,tenantId:'other'},id,a)).toBe(false);expect(f.service.authorizeAttach({...scope,workspaceId:'other'},id,a)).toBe(false);expect(f.service.authorizeAttach(scope,'wrong',a)).toBe(false);expect((await f.service.openTerminal(scope,id)).ok).toBe(false);expect(f.counts().creates).toBe(1);}));
 it('refuses attachment before environment exists',()=>run(async f=>{expect((await f.service.openTerminal(scope,'missing')).ok).toBe(false);expect(f.counts().starts).toBe(0);}));
 it('runtime rejects spoofed identity',()=>run(async f=>{const id=await open(f);const r=f.manager.get(scope)!;let rejected=false;try{f.auth({...r,id:id.replace(/.$/,'x')} as EnvironmentIdentity);}catch{rejected=true;}expect(rejected).toBe(true);}));
 it('expired authorization fences socket and cleanup releases environment',()=>run(async f=>{const id=await open(f),t=await terminal(f,id);f.advance();expect(f.service.authorizeAttach(scope,id,t)).toBe(false);expect(await f.service.sweep()).toEqual({ok:true,failed:0});expect(f.manager.get(scope)).toBeUndefined();}));
 it('temporary entitlement loss fences without implicit deletion',()=>run(async f=>{const id=await open(f),t=await terminal(f,id);f.allow(false);expect(f.service.authorizeAttach(scope,id,t)).toBe(false);expect(await f.service.sweep()).toEqual({ok:true,failed:0});expect(f.counts().destroys).toBe(0);}));
 it('lost reservation fences terminal attachment and preserves work',()=>run(async f=>{const id=await open(f),t=await terminal(f,id);f.hold(false);expect(f.service.authorizeAttach(scope,id,t)).toBe(false);expect((await f.service.openTerminal(scope,id)).ok).toBe(false);expect(await f.service.sweep()).toEqual({ok:true,failed:0});expect(f.counts().destroys).toBe(0);}));
 it('deny lifetime beyond existing offline runtime ceiling',()=>run(async f=>{const p={...policy,limits:{...policy.limits,lifetimeMinutes:11}};const c=context();expect((await f.service.open({...c,policy:{platform:p,organization:p,course:p,entitlement:p,verifiedRuntime:p,requested:p}},token())).ok).toBe(false);expect(f.counts().creates).toBe(0);}));
 it('gate generation change invalidates even if enabled again',()=>run(async f=>{const id=await open(f),t=await terminal(f,id);setAdminLabSwitch(false);setAdminLabSwitch(true);expect(f.service.authorizeAttach(scope,id,t)).toBe(false);expect(await f.service.sweep()).toEqual({ok:true,failed:0});expect(f.counts().destroys).toBe(1);}));
 it('explicit end requires confirmation and exact ID',()=>run(async f=>{const id=await open(f);expect((await f.service.end(scope,id,false)).ok).toBe(false);expect((await f.service.end(scope,'other',true)).ok).toBe(false);expect(f.counts().destroys).toBe(0);expect((await f.service.end(scope,id,true)).ok).toBe(true);}));
 it('failed revocation keeps reservation and retries cleanup',()=>run(async f=>{const id=await open(f),t=await terminal(f,id);f.fail(true);expect((await f.service.revoke(scope,id)).ok).toBe(false);expect(f.service.authorizeAttach(scope,id,t)).toBe(false);expect(f.manager.get(scope)?.state).toBe('cleanup_pending');expect((await f.service.open(context(),token())).ok).toBe(false);f.fail(false);expect(await f.service.sweep()).toEqual({ok:true,failed:0});}));
 it('revokes pending allocation before grant is returned',()=>run(async f=>{let resume!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>resume=r),ready=new Promise<void>(r=>entered=r);const orig=f.driver.provision;f.driver.provision=async e=>{await orig(e);entered();await waiting;};const opening=f.service.open(context(),token());await ready;const revoking=f.service.revoke(scope,f.manager.get(scope)!.id);resume();expect((await opening).ok).toBe(false);expect((await revoking).ok).toBe(true);expect(f.counts().destroys).toBe(1);}));
});

const origin='http://localhost:3000',winA='window-aaaaaaaa',winB='window-bbbbbbbb';
async function browserFixture(f:ReturnType<typeof fixture>){
 let now=1000;const b=new UnifiedLinuxBrowserAdmission(f.service,origin,()=>now);
 const r=await b.open(context(),winA,token());if(!r.ok)throw Error(r.reason);
 const id=r.environment.id,g=r.windowGeneration;
 const t=await b.openTerminal(scope,id,winA,g);if(!t.ok)throw Error(t.reason);
 const terminalId=t.terminalId;
 const issue=()=>{const ticket=b.issueAttach(scope,id,winA,g,terminalId);if(!ticket.ok)throw Error(ticket.reason);return ticket.attachToken;};
 return {b,id,g,terminalId,issue,advance:()=>{now+=30000;}};
}
describe('unified browser ownership and one-use attach tickets',()=>{
 it('same window resumes exact environment',()=>run(async f=>{const x=await browserFixture(f);const r=await x.b.open(context(),winA,token());expect(r).toMatchObject({ok:true,environment:{id:x.id},windowGeneration:x.g});expect(f.counts().creates).toBe(1);}));
 it('another window cannot implicitly replace active work',()=>run(async f=>{const x=await browserFixture(f);expect(await x.b.open(context(),winB,token())).toMatchObject({ok:false,reason:'UNIFIED_WINDOW_CONFLICT'});expect(f.counts().destroys).toBe(0);}));
 it('ticket binds scope, environment and window generation',()=>run(async f=>{const x=await browserFixture(f);for(const [s,id,w,g] of [[{...scope,tenantId:'other'},x.id,winA,x.g],[scope,'other',winA,x.g],[scope,x.id,winB,x.g],[scope,x.id,winA,x.g+1]] as const){expect(x.b.issueAttach(s,id,w,g,x.terminalId).ok).toBe(false);}}));
 it('ticket is opaque, single-use and exact-origin',()=>run(async f=>{const x=await browserFixture(f),t=x.issue();expect(t.length).toBe(43);expect(x.b.consume(x.terminalId,t,'https://other.example')).toBe(null);expect(x.b.consume(x.terminalId,t,undefined)).toBe(null);expect(x.b.consume(x.terminalId,t,origin)?.actor).toBe(scope.actorId);expect(x.b.consume(x.terminalId,t,origin)).toBe(null);}));
 it('wrong terminal and expired ticket rejected',()=>run(async f=>{const x=await browserFixture(f),t=x.issue();expect(x.b.consume('term_00000000-0000-4000-8000-000000000000',t,origin)).toBe(null);x.advance();expect(x.b.consume(x.terminalId,t,origin)).toBe(null);}));
 it('fresh ticket supersedes previous ticket',()=>run(async f=>{const x=await browserFixture(f),a=x.issue(),b=x.issue();expect(x.b.consume(x.terminalId,a,origin)).toBe(null);expect(x.b.consume(x.terminalId,b,origin)?.actor).toBe(scope.actorId);}));
 it('revocation before upgrade invalidates consumed authority',()=>run(async f=>{const x=await browserFixture(f),a=x.b.consume(x.terminalId,x.issue(),origin)!;expect(a.stillAllowed()).toBe(true);await f.service.revoke(scope,x.id);expect(a.stillAllowed()).toBe(false);}));
 it('transfer requires confirmation and matching generation',()=>run(async f=>{const x=await browserFixture(f);expect((await x.b.transfer(scope,x.id,winA,x.g,winB,false)).ok).toBe(false);expect((await x.b.transfer(scope,x.id,winA,x.g+1,winB,true)).ok).toBe(false);expect(x.b.consume(x.terminalId,x.issue(),origin)?.actor).toBe(scope.actorId);}));
 it('explicit transfer closes old peer, preserves PTY and invalidates outstanding authority',()=>run(async f=>{const x=await browserFixture(f),authority=x.b.consume(x.terminalId,x.issue(),origin)!;let closed=0;const old={send:()=>true,close:()=>{closed++;}};expect(f.service.transport.connect(x.terminalId,scope.actorId,old)).toBe(true);expect(await x.b.transfer(scope,x.id,winA,x.g,winB,true)).toEqual({ok:true,windowGeneration:2});expect(closed).toBe(1);expect(authority.stillAllowed()).toBe(false);expect(f.counts()).toEqual({creates:1,destroys:0,starts:1});expect(x.b.issueAttach(scope,x.id,winA,x.g,x.terminalId).ok).toBe(false);const t=x.b.issueAttach(scope,x.id,winB,2,x.terminalId);if(!t.ok)throw Error(t.reason);expect(x.b.consume(x.terminalId,t.attachToken,origin)?.actor).toBe(scope.actorId);expect(f.service.transport.connect(x.terminalId,scope.actorId,{send:()=>true,close:()=>{}})).toBe(true);await f.service.transport.receive(x.terminalId,old,JSON.stringify({type:'cancel'}));expect(f.counts().destroys).toBe(0);}));
 it('transfer invalidates not-yet-consumed ticket and old window cannot reclaim',()=>run(async f=>{const x=await browserFixture(f),t=x.issue();expect((await x.b.transfer(scope,x.id,winA,1,winB,true)).ok).toBe(true);expect(x.b.consume(x.terminalId,t,origin)).toBe(null);expect((await x.b.transfer(scope,x.id,winB,2,winA,true)).ok).toBe(false);expect((await x.b.open(context(),winA,token())).ok).toBe(false);}));
 it('current server authorization and reservation checked again at consume',()=>run(async f=>{const x=await browserFixture(f),t=x.issue();f.hold(false);expect(x.b.consume(x.terminalId,t,origin)).toBe(null);expect((await x.b.transfer(scope,x.id,winA,1,winB,true)).ok).toBe(false);}));
 it('new window after verified environment cleanup may create only a fresh environment',()=>run(async f=>{const x=await browserFixture(f),t=x.issue();expect((await f.service.end(scope,x.id,true)).ok).toBe(true);const r=await x.b.open(context(),winB,token());if(!r.ok)throw Error(r.reason);expect(r.environment.id===x.id).toBe(false);expect(x.b.consume(x.terminalId,t,origin)).toBe(null);expect((await x.b.open(context(),winA,token())).ok).toBe(false);}));
 it('transfer fences stale input and resize on both PTYs without closing new peers',()=>run(async f=>{let writes=0,resizes=0;f.driver.openTerminal=async e=>{f.auth(e);const stream=new PassThrough();stream.on('data',()=>{writes++;});return {stream,resize:async()=>{resizes++;},disconnect:()=>{},exited:async()=>false};};const x=await browserFixture(f),t=await x.b.openTerminal(scope,x.id,winA,1);if(!t.ok)throw Error(t.reason);const ids=[x.terminalId,t.terminalId];let closed=0;const peers=ids.map(()=>({send:()=>true,close:()=>{closed++;}}));ids.forEach((id,i)=>expect(f.service.transport.connect(id,scope.actorId,peers[i])).toBe(true));expect((await x.b.transfer(scope,x.id,winA,1,winB,true)).ok).toBe(true);expect(closed).toBe(2);for(const [i,id] of ids.entries()){const fresh={send:()=>true,close:()=>{closed++;}};expect(f.service.transport.connect(id,scope.actorId,fresh)).toBe(true);await f.service.transport.receive(id,peers[i],JSON.stringify({type:'input',data:'stale'}));await f.service.transport.receive(id,peers[i],JSON.stringify({type:'resize',rows:25,cols:80}));f.service.transport.disconnect(id,peers[i]);await f.service.transport.receive(id,fresh,JSON.stringify({type:'input',data:'fresh'}));await f.service.transport.receive(id,fresh,JSON.stringify({type:'resize',rows:25,cols:80}));}expect(writes).toBe(2);expect(resizes).toBe(2);expect(closed).toBe(2);expect(f.counts().destroys).toBe(0);}));

});

describe('unified browser API boundary',()=>{
 it('status does not allocate and open receives only trusted grant and scope',()=>run(async f=>{
  const {dispatchUnifiedBrowserApi}=await import('./unifiedLinuxBrowserApi.js');const b=new UnifiedLinuxBrowserAdmission(f.service,origin),auth=async()=>({context:context(),grant:token()});
  expect(await dispatchUnifiedBrowserApi(b,{action:'status',windowId:winA},auth)).toMatchObject({status:200,body:{ok:true,status:'absent'}});
  expect(f.counts().creates).toBe(0);
  expect(await dispatchUnifiedBrowserApi(b,{action:'open',windowId:winA,scope},auth)).toMatchObject({status:400});
  expect(await dispatchUnifiedBrowserApi(b,{action:'open',windowId:winA},async()=>null)).toMatchObject({status:401});
  expect(f.counts().creates).toBe(0);
  expect(await dispatchUnifiedBrowserApi(b,{action:'open',windowId:winA},auth)).toMatchObject({status:200,body:{ok:true,action:'created',windowGeneration:1}});
 }));
 it('status enumerates exact authorized terminal IDs and separate capacity',()=>run(async f=>{
  const x=await browserFixture(f);const other={...scope,workspaceId:'other'};
  expect(x.b.status(other,winA)).toEqual({ok:true,status:'absent'});
  expect(x.b.status(scope,winA)).toMatchObject({ok:true,status:'current',environmentId:x.id,terminalCount:1,maxTerminals:2,terminals:[{terminalId:x.terminalId,connected:false,attachable:true}]});
  const peer={send:()=>true,close:()=>{}};expect(f.service.transport.connect(x.terminalId,scope.actorId,peer)).toBe(true);
  expect(x.b.status(scope,winA)).toMatchObject({terminals:[{terminalId:x.terminalId,connected:true,attachable:false}]});
  f.allow(false);expect(x.b.status(scope,winA).ok).toBe(false);
 }));
 it('conflict provides previous owner CAS but not terminal IDs or attach credentials',()=>run(async f=>{
  const x=await browserFixture(f);expect(x.b.status(scope,winB)).toEqual({ok:true,status:'conflict',environmentId:x.id,currentWindowId:winA,windowGeneration:1});
  expect(x.b.issueAttach(scope,x.id,winB,1,x.terminalId).ok).toBe(false);
  expect((await x.b.transfer(scope,x.id,winA,1,winB,true)).ok).toBe(true);
  expect(x.b.status(scope,winA).ok).toBe(false);expect(x.b.status(scope,winB)).toMatchObject({ok:true,status:'current',windowGeneration:2,terminalCount:1});
 }));
 it('old window cannot end or reset after transfer',()=>run(async f=>{
  const x=await browserFixture(f);expect((await x.b.transfer(scope,x.id,winA,1,winB,true)).ok).toBe(true);
  expect((await x.b.end(scope,x.id,winA,1,true,'end')).ok).toBe(false);
  expect((await x.b.end(scope,x.id,winB,2,false,'reset')).ok).toBe(false);expect(f.counts().destroys).toBe(0);
  expect((await x.b.end(scope,x.id,winB,2,true,'end')).ok).toBe(true);expect(f.counts().destroys).toBe(1);
 }));
 it('rejects untrusted policy/grant, malformed generation and unconfirmed transfer/end',()=>run(async f=>{
  const {dispatchUnifiedBrowserApi}=await import('./unifiedLinuxBrowserApi.js');const x=await browserFixture(f);let calls=0;const auth=async()=>{calls++;return {context:context(),grant:token()};};
  const base={windowId:winA,environmentId:x.id,windowGeneration:1};
  for(const body of [{action:'open',windowId:winA,grant:'x'},{action:'open',windowId:winA,policy},{action:'terminal',...base,windowGeneration:0},{action:'attach',...base,terminalId:'invalid'},{action:'transfer',...base,previousWindowId:winB,confirmed:false},{action:'end',...base,confirmed:false,intent:'end'},{action:'end',...base,confirmed:true,intent:'unknown'}, {action:'__proto__',windowId:winA}])expect((await dispatchUnifiedBrowserApi(x.b,body,auth)).status).toBe(400);
  expect(calls).toBe(0);expect(f.counts().destroys).toBe(0);
 }));
 it('real HTTP adapter requires exact origin, authentication, JSON and no-store',()=>run(async f=>{
  const {createServer}=await import('node:http');const {createUnifiedBrowserHttpHandler}=await import('./unifiedLinuxBrowserApi.js');
  const b=new UnifiedLinuxBrowserAdmission(f.service,origin);let authCalls=0;
  const handler=createUnifiedBrowserHttpHandler(b,origin,async(req)=>{authCalls++;return req.headers.authorization==='Bearer test-only'?{context:context(),grant:token()}:null;});
  const server=createServer((req,res)=>{void handler(req,res);});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{
   const address=server.address();if(!address||typeof address==='string')throw Error('HTTP_BIND');
   const url=`http://127.0.0.1:${address.port}/sessions/unified`,body=JSON.stringify({action:'status',windowId:winA});
   const headers={origin,'content-type':'application/json',authorization:'Bearer test-only'};
   expect((await fetch(url,{method:'POST',headers:{...headers,origin:'http://localhost:9999'},body})).status).toBe(403);
   expect((await fetch(url,{method:'POST',headers:{...headers,'content-type':'text/plain'},body})).status).toBe(415);
   expect((await fetch(url,{method:'POST',headers,body:'x'.repeat(2049)})).status).toBe(413);expect(authCalls).toBe(0);
   expect((await fetch(url,{method:'POST',headers:{...headers,authorization:'wrong'},body})).status).toBe(401);
   const r=await fetch(url,{method:'POST',headers,body});expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.json()).toEqual({ok:true,status:'absent'});
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 }));
});
