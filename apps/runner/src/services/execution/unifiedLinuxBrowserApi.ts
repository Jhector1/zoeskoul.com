import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UnifiedLinuxBrowserAdmission } from './unifiedLinuxBrowserAdmission.js';
import { validWorkspacePath, validWorkspaceText, validWorkspaceBinary, validWorkspaceRevision, type WorkspaceReadRequest, type WorkspaceReadResult } from './unifiedLinuxWorkspaceRead.js';
import type { UnifiedAdmissionContext } from './unifiedLinuxAdmissionService.js';
import { isUnifiedTerminalId } from './unifiedLinuxTerminalTransport.js';

const PATH='/sessions/unified';
const fields={status:['action','windowId'],open:['action','windowId'],terminal:['action','windowId','environmentId','windowGeneration'],run:['action','windowId','environmentId','windowGeneration','path','expectedRevision'],attach:['action','windowId','environmentId','windowGeneration','terminalId'],shellExit:['action','windowId','environmentId','windowGeneration','terminalId'],transfer:['action','windowId','environmentId','windowGeneration','previousWindowId','confirmed'],end:['action','windowId','environmentId','windowGeneration','confirmed','intent'],workspace:['action','windowId','environmentId','windowGeneration','operation','path']} as const;
type Action=keyof typeof fields;
type RequestData={action:Action;windowId:string;environmentId?:string;windowGeneration?:number;terminalId?:string;previousWindowId?:string;confirmed?:boolean;intent?:'end'|'reset';operation?:'list'|'read'|'create'|'mkdir'|'snapshot'|'update'|'move'|'delete'|'rmdir'|'readBinary'|'createBinary'|'moveDirectory'|'trashDirectory'|'restoreDirectory'|'listTrash';path?:string;text?:string;data?:string;sizeBytes?:number;destinationPath?:string;trashId?:string;expectedRevision?:string};
const windowValid=(x:unknown):x is string=>typeof x==='string'&&/^window-[a-zA-Z0-9-]{8,96}$/.test(x);
const envValid=(x:unknown):x is string=>typeof x==='string'&&/^env_[a-zA-Z0-9_-]{8,128}$/.test(x);
const generationValid=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=1;
function parse(raw:unknown):RequestData|null{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const b=raw as Record<string,unknown>,action=b.action;
  if(typeof action!=='string'||!Object.prototype.hasOwnProperty.call(fields,action))return null;
  const keys=action==='workspace'&&b.operation==='update'?[...fields.workspace,'text','expectedRevision']:action==='workspace'&&(b.operation==='move'||b.operation==='moveDirectory')?[...fields.workspace,'destinationPath','expectedRevision']:action==='workspace'&&b.operation==='trashDirectory'?[...fields.workspace,'expectedRevision']:action==='workspace'&&b.operation==='restoreDirectory'?[...fields.workspace,'trashId']:action==='workspace'&&b.operation==='delete'?[...fields.workspace,'expectedRevision']:action==='workspace'&&b.operation==='create'?[...fields.workspace,'text']:action==='workspace'&&b.operation==='createBinary'?[...fields.workspace,'data','sizeBytes']:fields[action as Action];
  if(Object.keys(b).length!==keys.length||!keys.every(k=>Object.prototype.hasOwnProperty.call(b,k))||!windowValid(b.windowId))return null;
  if(action!=='status'&&action!=='open'&&(!envValid(b.environmentId)||!generationValid(b.windowGeneration)))return null;
  if(action==='run'&&(!validWorkspacePath(b.path)||!b.path.endsWith('.py')||!validWorkspaceRevision(b.expectedRevision)))return null;
  if((action==='attach'||action==='shellExit')&&(typeof b.terminalId!=='string'||!isUnifiedTerminalId(b.terminalId)))return null;
  if(action==='transfer'&&(!windowValid(b.previousWindowId)||b.confirmed!==true))return null;
  if(action==='end'&&(b.confirmed!==true||(b.intent!=='end'&&b.intent!=='reset')))return null;
  if(action==='workspace'&&(typeof b.operation!=='string'||!['list','read','create','mkdir','snapshot','update','move','delete','rmdir','readBinary','createBinary','moveDirectory','trashDirectory','restoreDirectory','listTrash'].includes(b.operation)||((b.operation==='snapshot'||b.operation==='listTrash')?b.path!=='':!validWorkspacePath(b.path,b.operation==='list'))||((b.operation==='create'||b.operation==='update')&&!validWorkspaceText(b.text))||(b.operation==='createBinary'&&!validWorkspaceBinary(b.data,b.sizeBytes))||(b.operation==='update'&&!validWorkspaceRevision(b.expectedRevision))||((['move','delete','moveDirectory','trashDirectory'].includes(b.operation))&&!validWorkspaceRevision(b.expectedRevision))||((b.operation==='move'||b.operation==='moveDirectory')&&(!validWorkspacePath(b.destinationPath)||b.destinationPath===b.path||(b.operation==='moveDirectory'&&b.destinationPath.startsWith(b.path+'/'))))||(b.operation==='restoreDirectory'&&(typeof b.trashId!=='string'||!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(b.trashId)))))return null;
  return b as RequestData;
}
export type UnifiedBrowserApiAuthority=Readonly<{context:UnifiedAdmissionContext;grant?:unknown}>;
/** Trusted resolver must validate the authenticated actor and current tenant /
 * workspace entitlement. Mint a fresh grant for open only. Do not derive
 * scope or entitlement from any values supplied by the request body. */
export type UnifiedBrowserApiResolver=(req:IncomingMessage,action:Action)=>Promise<UnifiedBrowserApiAuthority|null>;
const fail=(reason:string,status:number)=>({status,body:{ok:false as const,reason}});
function response<T extends {ok:boolean;reason?:string}>(result:T){
  if(result.ok)return {status:200,body:result};
  // Preserve machine-readable reason, never expose external errors or runtime details.
  const reason=result.reason&&/^[A-Z0-9_]{1,100}$/.test(result.reason)?result.reason:'UNIFIED_REQUEST_FAILED';
  return fail(reason,reason.includes('CONFLICT')||reason.includes('LIMIT')?409:reason.includes('FORBIDDEN')||reason.includes('DENIED')?403:503);
}
type WorkspaceReader=(scope:UnifiedAdmissionContext['scope'],id:string,request:WorkspaceReadRequest,authorize:()=>boolean)=>Promise<WorkspaceReadResult>;
export async function dispatchUnifiedBrowserApi(browser:UnifiedLinuxBrowserAdmission,raw:unknown,resolve:(action:Action)=>Promise<UnifiedBrowserApiAuthority|null>,workspace?:WorkspaceReader){
  const b=parse(raw);if(!b)return fail('UNIFIED_REQUEST_INVALID',400);
  try{
    const auth=await resolve(b.action);if(!auth)return fail('UNIFIED_AUTHENTICATION_REQUIRED',401);
    const scope=auth.context.scope,w=b.windowId,id=b.environmentId!,g=b.windowGeneration!;
    switch(b.action){
      case 'status':return response(browser.status(scope,w));
      case 'open':{
        const r=await browser.open(auth.context,w,auth.grant);
        return response(r.ok?{ok:true,environmentId:r.environment.id,action:r.action,windowGeneration:r.windowGeneration}:r);
      }
      case 'terminal':return response(await browser.openTerminal(scope,id,w,g));
      case 'run':return response(await browser.openTerminal(scope,id,w,g,Object.freeze({path:b.path!,expectedRevision:b.expectedRevision!})));
      case 'attach':return response(browser.issueAttach(scope,id,w,g,b.terminalId!));
      case 'shellExit':return response(await browser.closeShell(scope,id,w,g,b.terminalId!));
      case 'transfer':return response(await browser.transfer(scope,id,b.previousWindowId!,g,w,b.confirmed===true));
      case 'workspace':{
        const owns=()=>{const r=browser.status(scope,w);return r.ok&&r.status==='current'&&r.environmentId===id&&r.windowGeneration===g;};
        if(!workspace||!owns())return fail('UNIFIED_WORKSPACE_FORBIDDEN',403);
        const request:WorkspaceReadRequest=b.operation==='update'?{operation:'update',path:b.path!,text:b.text!,expectedRevision:b.expectedRevision!}:b.operation==='move'?{operation:'move',path:b.path!,destinationPath:b.destinationPath!,expectedRevision:b.expectedRevision!}:b.operation==='moveDirectory'?{operation:'moveDirectory',path:b.path!,destinationPath:b.destinationPath!,expectedRevision:b.expectedRevision!}:b.operation==='trashDirectory'?{operation:'trashDirectory',path:b.path!,expectedRevision:b.expectedRevision!}:b.operation==='restoreDirectory'?{operation:'restoreDirectory',path:b.path!,trashId:b.trashId!}:b.operation==='delete'?{operation:'delete',path:b.path!,expectedRevision:b.expectedRevision!}:b.operation==='create'?{operation:'create',path:b.path!,text:b.text!}:b.operation==='createBinary'?{operation:'createBinary',path:b.path!,data:b.data!,sizeBytes:b.sizeBytes!}:{operation:b.operation!,path:b.path!} as WorkspaceReadRequest;
        const run=()=>owns()?workspace(scope,id,request,owns):Promise.resolve({ok:false as const,reason:'UNIFIED_WORKSPACE_FORBIDDEN'});
        const r=await (request.operation==='create'||request.operation==='createBinary'||request.operation==='mkdir'||request.operation==='update'||request.operation==='move'||request.operation==='delete'||request.operation==='rmdir'||request.operation==='moveDirectory'||request.operation==='trashDirectory'||request.operation==='restoreDirectory'?browser.workspaceMutation(scope,id,w,g,run):run());
        return owns()?response(r):fail('UNIFIED_WORKSPACE_FORBIDDEN',403);
      }
      case 'end':return response(await browser.end(scope,id,w,g,b.confirmed===true,b.intent!));
    }
  }catch{return fail('UNIFIED_REQUEST_UNAVAILABLE',503);}
}
/** Explicitly mounted HTTP adapter, no global startup side effects. Intended
 * for same-origin routes. One browser/service per isolated runtime. */
export function createUnifiedBrowserHttpHandler(browser:UnifiedLinuxBrowserAdmission,origin:string,resolve:UnifiedBrowserApiResolver,workspace?:WorkspaceReader){
  const url=new URL(origin);
  if(url.origin!==origin||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw Error('UNIFIED_ORIGIN_INVALID');
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const reply=(r:{status:number;body:unknown})=>{if(res.destroyed||res.writableEnded)return;res.writeHead(r.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(r.body));};
    if(req.url!==PATH){reply(fail('UNIFIED_ROUTE_NOT_FOUND',404));return;}
    if(req.method!=='POST'){reply(fail('UNIFIED_METHOD_INVALID',405));return;}
    if(req.headers.origin!==origin){reply(fail('UNIFIED_ORIGIN_FORBIDDEN',403));return;}
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??'')){reply(fail('UNIFIED_CONTENT_TYPE_INVALID',415));return;}
    const length=req.headers['content-length'];
    if(length===undefined||!/^\d{1,6}$/.test(length)||Number(length)>131072){reply(fail('UNIFIED_BODY_LIMIT',413));return;}
    try{
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req){const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=data.length;if(size>131072||size>Number(length)){req.destroy();return;}chunks.push(data);}
      if(size!==Number(length)){reply(fail('UNIFIED_REQUEST_INVALID',400));return;}
      let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{reply(fail(size>2048?'UNIFIED_BODY_LIMIT':'UNIFIED_REQUEST_INVALID',size>2048?413:400));return;}
      if(size>2048&&(!body||typeof body!=='object'||(body as RequestData).action!=='workspace'||!['create','update','createBinary'].includes((body as RequestData).operation??''))){reply(fail('UNIFIED_BODY_LIMIT',413));return;}
      reply(await dispatchUnifiedBrowserApi(browser,body,action=>resolve(req,action),workspace));
    }catch{reply(fail('UNIFIED_REQUEST_UNAVAILABLE',503));}
  };
}
