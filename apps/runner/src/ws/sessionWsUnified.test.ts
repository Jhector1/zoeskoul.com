import type { UnifiedAttachGate } from '../services/execution/unifiedLinuxBrowserAdmission.js';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { describe,it,expect,vi } from 'vitest';
import { attachSessionWsServer } from './sessionWsServer.js';
import type { UnifiedLinuxTerminalTransport, UnifiedTerminalPeer } from '../services/execution/unifiedLinuxTerminalTransport.js';

const f=vi.hoisted(()=>({getSession:vi.fn(),kill:vi.fn(),verify:vi.fn()}));
vi.mock('../services/sessions/sessionStore.js',()=>({getSession:f.getSession,subscribeSession:vi.fn(),setSessionTransportAttached:vi.fn(),touchSession:vi.fn()}));
vi.mock('../services/docker/writeInput.js',()=>({writeInput:vi.fn()}));
vi.mock('../services/docker/resizeSession.js',()=>({resizeSession:vi.fn()}));
vi.mock('../services/docker/killSession.js',()=>({killSession:f.kill}));
vi.mock('../lib/ptyAttachToken.js',()=>({verifyAttachToken:f.verify}));
vi.mock('../services/execution/adminReattachPolicy.js',()=>({isGlobalAdminShell:()=>false,mayAttachGlobalAdminShell:()=>false}));
vi.mock('../services/execution/learningAdminSwitch.js',()=>({adminLabSwitchStatus:()=>({enabled:false})}));
const id='term_01234567-0123-4123-8123-0123456789ab';
async function withServer(transport:UnifiedLinuxTerminalTransport|undefined,run:(url:string,clients:WebSocket[])=>Promise<void>,gate?:UnifiedAttachGate){
  const server:Server=createServer((_q,r)=>{r.writeHead(404);r.end();});
  const upgrade=attachSessionWsServer(transport,gate);
  server.on('upgrade',(req,socket,head)=>{if(!upgrade(req,socket,head))socket.destroy();});
  const clients:WebSocket[]=[];
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{await run(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/sessions/${id}/ws?token=test`,clients);}
  finally{for(const c of clients)c.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
function claims(actor='actor',sid=id){f.verify.mockReset().mockReturnValue({sid,actor,exp:Date.now()+10000});f.getSession.mockClear();f.kill.mockClear();}
function fake(){
  const canConnect=vi.fn((_id:string,actor:string)=>actor==='actor');
  const connect=vi.fn((_id:string,_actor:string,peer:UnifiedTerminalPeer)=>peer.send({type:'ready',sessionId:id,state:'waiting_for_input'}));
  const receive=vi.fn(async()=>{}),disconnect=vi.fn();
  return {canConnect,connect,receive,disconnect,transport:{canConnect,connect,receive,disconnect} as unknown as UnifiedLinuxTerminalTransport};
}
function rejected(url:string,clients:WebSocket[]):Promise<number>{
 return new Promise((resolve,reject)=>{
  const c=new WebSocket(url,{origin:'http://localhost:3000'});clients.push(c);c.on('error',()=>{});
  c.once('unexpected-response',(_req,res)=>{const status=res.statusCode??0;res.resume();c.terminate();resolve(status);});
  c.once('open',()=>reject(Error('Unexpected socket admission')));
 });
}
describe('unified terminal branch of existing WebSocket route',()=>{
 it('denies injected transport without window ticket gate',async()=>{claims();const p=fake();await withServer(p.transport,async(url,cs)=>expect(await rejected(url,cs)).toBe(403));expect(p.canConnect).not.toHaveBeenCalled();});
 it('denies stale authority before upgrade',async()=>{claims();const p=fake();await withServer(p.transport,async(url,cs)=>expect(await rejected(url,cs)).toBe(403),{consume:()=>({actor:'actor',mayAttach:()=>false,stillAllowed:()=>false})});expect(p.connect).not.toHaveBeenCalled();});
 it('denies unified IDs when no provider is installed',async()=>{claims();await withServer(undefined,async(url,cs)=>expect(await rejected(url,cs)).toBe(403));expect(f.getSession).not.toHaveBeenCalled();});
 it('rejects wrong actor before upgrade',async()=>{claims('foreign');const p=fake();await withServer(p.transport,async(url,cs)=>expect(await rejected(url,cs)).toBe(403),{consume:()=>({actor:'foreign',mayAttach:()=>true,stillAllowed:()=>true})});expect(p.connect).not.toHaveBeenCalled();});
 it('rejects unbound legacy token before unified provider lookup',async()=>{claims('actor','other');const p=fake();await withServer(p.transport,async(url,cs)=>expect(await rejected(url,cs)).toBe(403),{consume:()=>null});expect(p.canConnect).not.toHaveBeenCalled();expect(f.verify).not.toHaveBeenCalled();});
 it('passes input and cancellation to unified provider, never legacy kill',async()=>{
  claims();const p=fake();await withServer(p.transport,async(url,cs)=>{
   const c=new WebSocket(url,{origin:'http://localhost:3000'});cs.push(c);
   await new Promise<void>((resolve,reject)=>{c.once('error',reject);c.once('message',raw=>{try{expect(JSON.parse(String(raw)).type).toBe('ready');resolve();}catch(e){reject(e);}});});
   const payload=JSON.stringify({type:'cancel'});c.send(payload);
   await vi.waitFor(()=>expect(p.receive).toHaveBeenCalledWith(id,expect.any(Object),payload));
   await new Promise<void>(resolve=>{c.once('close',()=>resolve());c.close();});
   await vi.waitFor(()=>expect(p.disconnect).toHaveBeenCalled());
  },{consume:(_id,_token,origin)=>origin==='http://localhost:3000'?{actor:'actor',mayAttach:()=>true,stillAllowed:()=>true}:null});expect(f.kill).not.toHaveBeenCalled();expect(f.getSession).not.toHaveBeenCalled();
 });
});
