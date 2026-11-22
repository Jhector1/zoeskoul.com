import { Duplex } from 'node:stream';
import { describe,it,expect } from 'vitest';
import { UnifiedLinuxEnvironmentManager, type UnifiedLinuxRuntime } from './unifiedLinuxEnvironmentManager.js';
import { UnifiedLinuxTerminalTransport, type UnifiedTerminalPeer, isUnifiedTerminalId } from './unifiedLinuxTerminalTransport.js';
import { linuxCapabilities,type LinuxPolicy } from './unifiedLinuxPolicy.js';
const scope={tenantId:'tenant',actorId:'actor',workspaceId:'workspace'};
const policy:LinuxPolicy={capabilities:Object.fromEntries(linuxCapabilities.map(k=>[k,false])) as LinuxPolicy['capabilities'],limits:{maxTerminals:3,memoryMiB:512,cpuMillicores:500,pids:64,diskMiB:1024,idleMinutes:30,lifetimeMinutes:120}};
const input={platform:policy,organization:policy,course:policy,entitlement:policy,verifiedRuntime:policy,requested:policy};
function peer(){const frames:any[]=[],closes:any[]=[];const p:UnifiedTerminalPeer={send(f){frames.push(f);return true;},close(c,r){closes.push([c,r]);}};return {p,frames,closes};}
async function setup(max=128){
 let running=false,authorized=true,destroyed=0,starts=0,finished=false,disconnects=0;
 const inputs:string[]=[],sizes:number[][]=[],streams:Duplex[]=[];
 const runtime:UnifiedLinuxRuntime={async provision(){running=true;},async inspect(){return running?'running':'absent';},async destroy(){destroyed++;running=false;},async openTerminal(){starts++;const stream=new Duplex({read(){},write(chunk,_encoding,cb){inputs.push(String(chunk));cb();}});streams.push(stream);return {stream,resize:async(r,c)=>{sizes.push([r,c]);},disconnect:()=>{disconnects++;stream.destroy();},exited:async()=>finished};}};
 const manager=new UnifiedLinuxEnvironmentManager(runtime,()=>`env_test_12345678`);
 const transport=new UnifiedLinuxTerminalTransport(manager,max);
 await manager.open(scope,input);const id=manager.get(scope)!.id;
 const open=()=>transport.openTerminal(scope,id,()=>authorized);
 async function start(){const r=await open();if(!r.ok)throw Error(r.reason);return r.terminalId;}
 return {manager,transport,id,open,start,inputs,sizes,streams,runtime,revoke:()=>{authorized=false;},restore:()=>{authorized=true;},finish:()=>{finished=true;},counts:()=>({destroyed,starts,disconnects})};
}
const msg=(data:unknown)=>JSON.stringify(data);
const tick=()=>new Promise<void>(r=>setImmediate(r));
describe('unified terminal transport over manager',()=>{
 it('uses a manager-issued terminal identity',async()=>{const f=await setup();expect(isUnifiedTerminalId(await f.start())).toBe(true);expect(f.counts().starts).toBe(1);expect(f.manager.get(scope)?.terminalCount).toBe(1);});
 it('rejects a foreign actor',async()=>{const f=await setup();const id=await f.start();const a=peer();expect(f.transport.connect(id,'foreign',a.p)).toBe(false);expect(a.frames.length).toBe(0);});
 it('denies creation without current authorization',async()=>{const f=await setup();f.revoke();expect(await f.open()).toEqual({ok:false,reason:'TERMINAL_FORBIDDEN'});expect(f.counts().starts).toBe(0);});
 it('rejects another writer without evicting the original',async()=>{const f=await setup();const id=await f.start(),a=peer(),b=peer();expect(f.transport.connect(id,'actor',a.p)).toBe(true);expect(f.transport.connect(id,'actor',b.p)).toBe(false);expect(a.closes.length).toBe(0);});
 it('replays output captured before first socket',async()=>{const f=await setup();const id=await f.start();f.streams[0].push('hello');await tick();const a=peer();expect(f.transport.connect(id,'actor',a.p)).toBe(true);expect(a.frames.map(x=>x.type)).toEqual(['ready','event','admin_replay_complete']);expect(a.frames[1].event.chunk).toBe('hello');expect(a.frames[2].seq).toBe(1);});
 it('preserves stream and capacity on browser disconnect',async()=>{const f=await setup();const id=await f.start(),a=peer(),b=peer();f.transport.connect(id,'actor',a.p);f.transport.disconnect(id,a.p);f.streams[0].push('during disconnect');await tick();expect(f.transport.connect(id,'actor',b.p)).toBe(true);expect(b.frames[1].event.chunk).toBe('during disconnect');expect(f.counts()).toEqual({destroyed:0,starts:1,disconnects:0});expect(f.manager.get(scope)?.terminalCount).toBe(1);});
 it('stale socket cannot write, resize, or disconnect successor',async()=>{const f=await setup();const id=await f.start(),a=peer(),b=peer();f.transport.connect(id,'actor',a.p);f.transport.disconnect(id,a.p);f.transport.connect(id,'actor',b.p);await f.transport.receive(id,a.p,msg({type:'input',data:'bad'}));await f.transport.receive(id,a.p,msg({type:'resize',rows:3,cols:5}));f.transport.disconnect(id,a.p);await f.transport.receive(id,b.p,msg({type:'input',data:'good'}));expect(f.inputs).toEqual(['good']);expect(f.sizes).toEqual([]);});
 it('routes terminal messages only to the selected PTY',async()=>{const f=await setup();const id=await f.start(),other=await f.start(),a=peer(),b=peer();f.transport.connect(id,'actor',a.p);f.transport.connect(other,'actor',b.p);f.streams[0].push('one');await tick();expect(a.frames[2].event.chunk).toBe('one');expect(b.frames.length).toBe(2);await f.transport.receive(id,a.p,msg({type:'resize',rows:25,cols:80}));expect(f.sizes).toEqual([[25,80]]);});
 it('cancel detaches without ending shell or environment',async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);await f.transport.receive(id,a.p,msg({type:'cancel'}));expect(a.closes[0]).toEqual([1000,'Terminal detached']);expect(f.counts()).toEqual({destroyed:0,starts:1,disconnects:0});expect(f.manager.get(scope)?.terminalCount).toBe(1);});
 it('revocation blocks further input',async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);f.revoke();await f.transport.receive(id,a.p,msg({type:'input',data:'bad'}));expect(f.inputs).toEqual([]);expect(a.closes[0][0]).toBe(1008);expect(f.manager.get(scope)?.terminalCount).toBe(1);});
 it('revocation blocks further output',async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);f.revoke();f.streams[0].push('secret');await tick();expect(a.frames.length).toBe(2);expect(a.closes[0][0]).toBe(1008);});
 it('bounded replay exposes a sequence gap instead of unbounded history',async()=>{const f=await setup();const id=await f.start();f.streams[0].push(Buffer.alloc(200000,65));await tick();const a=peer();f.transport.connect(id,'actor',a.p);const events=a.frames.filter(x=>x.type==='event');expect(events[0].event.seq>1).toBe(true);expect(events.reduce((n,x)=>n+Buffer.byteLength(x.event.chunk),0)<=65536).toBe(true);expect(a.frames.at(-1).seq).toBe(events.at(-1).event.seq);});
 it('preserves UTF8 across Docker chunks',async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);const buf=Buffer.from('é😊');f.streams[0].push(buf.subarray(0,3));f.streams[0].push(buf.subarray(3));await tick();expect(a.frames.filter(x=>x.type==='event').map(x=>x.event.chunk).join('')).toBe('é😊');});
 it('backpressure disconnects the browser, not the shell',async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);a.p.send=()=>false;f.streams[0].push('x');await tick();expect(a.closes[0][0]).toBe(1013);expect(f.counts().disconnects).toBe(0);});
 for(const payload of ['null','{}','{',msg({type:'input',data:42}),msg({type:'input',data:'a'.repeat(9000)}),msg({type:'resize',rows:0,cols:1}),msg({type:'resize',rows:1.2,cols:80})])it('rejects malformed or over-limit frame '+payload.slice(0,25),async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);await f.transport.receive(id,a.p,payload);expect(a.closes[0][0]).toBe(1008);expect(f.inputs).toEqual([]);expect(f.sizes).toEqual([]);});
 it('limits concurrent transport allocation',async()=>{const f=await setup(1);const r=await Promise.all([f.open(),f.open()]);expect(r.filter(x=>x.ok).length).toBe(1);expect(f.counts().starts).toBe(1);});
 it('retains uncertain shell exit slot',async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);f.streams[0].push(null);await tick();await f.transport.reconcile();expect(f.manager.get(scope)?.terminalCount).toBe(1);expect(f.transport.canConnect(id,'actor')).toBe(false);expect(f.counts().destroyed).toBe(0);});
 it('confirmed exit releases only terminal slot',async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);f.finish();f.streams[0].push(null);await tick();await f.transport.reconcile();expect(f.manager.get(scope)?.terminalCount).toBe(0);expect(f.counts().destroyed).toBe(0);expect(a.frames.at(-1).event.state).toBe('completed');expect(a.closes[0][0]).toBe(1000);});
 it('retries confirmed exit after ambiguous error',async()=>{const f=await setup();await f.start();f.streams[0].push(null);await tick();await f.transport.reconcile();expect(f.manager.get(scope)?.terminalCount).toBe(1);f.finish();await f.transport.reconcile();expect(f.manager.get(scope)?.terminalCount).toBe(0);});
 it('environment end fences existing sockets',async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);await f.manager.end(scope,f.id,true);await f.transport.receive(id,a.p,msg({type:'input',data:'bad'}));await f.transport.reconcile();expect(f.inputs).toEqual([]);expect(f.transport.canConnect(id,'actor')).toBe(false);expect(f.counts().destroyed).toBe(1);});
 it('heartbeat replies without allocating or changing container',async()=>{const f=await setup();const id=await f.start(),a=peer();f.transport.connect(id,'actor',a.p);await f.transport.receive(id,a.p,msg({type:'ping'}));expect(a.frames.at(-1)).toEqual({type:'pong'});expect(f.counts()).toEqual({destroyed:0,starts:1,disconnects:0});});
});

describe('temporary Web authorization lease',()=>{
 it('fences expired connection without destroying shell and permits fresh authorized replay',async()=>{
  const f=await setup();const id=await f.start(),a=peer(),b=peer();f.transport.connect(id,'actor',a.p);
  f.revoke();await f.transport.reconcile();expect(a.closes[0][0]).toBe(1008);
  f.streams[0].push('retained while unauthorized');await tick();expect(a.frames.length).toBe(2);
  expect(f.transport.canConnect(id,'actor')).toBe(false);expect(f.manager.get(scope)?.terminalCount).toBe(1);
  f.restore();expect(f.transport.connect(id,'actor',b.p)).toBe(true);
  expect(b.frames[1].event.chunk).toBe('retained while unauthorized');
  await f.transport.receive(id,a.p,msg({type:'input',data:'stale'}));
  await f.transport.receive(id,b.p,msg({type:'input',data:'fresh'}));expect(f.inputs).toEqual(['fresh']);
  expect(f.counts()).toEqual({destroyed:0,starts:1,disconnects:0});
 });
 it('reauthorization cannot restore a shell whose stream actually ended',async()=>{
  const f=await setup();const id=await f.start(),a=peer(),b=peer();f.transport.connect(id,'actor',a.p);
  f.revoke();await f.transport.reconcile();f.streams[0].push(null);await tick();await f.transport.reconcile();
  f.restore();expect(f.transport.connect(id,'actor',b.p)).toBe(false);expect(f.manager.get(scope)?.terminalCount).toBe(1);
  f.finish();await f.transport.reconcile();expect(f.manager.get(scope)?.terminalCount).toBe(0);
 });
});
