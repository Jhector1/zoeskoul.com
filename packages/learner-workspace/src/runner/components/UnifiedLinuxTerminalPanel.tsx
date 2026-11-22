"use client";
import React from 'react';
import type { UnifiedCompletedRun } from './unifiedLinuxClient';
import XtermTerminal from './XtermTerminal';
import WorkspaceTerminalToolbar,{WorkspaceTerminalLayoutContext} from './WorkspaceTerminalToolbar';
import UnifiedLinuxWorkspaceExplorer from './UnifiedLinuxWorkspaceExplorer';
import type { TerminalChunk } from '@zoeskoul/learner-workspace/runner/runtime';
import { heartbeatIntervalMs,heartbeatDeadlineMs,reconnectDelaysMs,stableConnectionMs,transportTimeoutMs } from './fullPrivilegesReconnect';
import { parseUnifiedStatus,parseUnifiedFrame,UnifiedReplay,unifiedRequest,unifiedSocketUrl,unifiedInputFrame,unifiedResizeFrame,unifiedDocumentWindowId,verifiedUnifiedResetAndReopen,type UnifiedLinuxClientConfig,type UnifiedStatus,type UnifiedOwner,type UnifiedAction,type UnifiedRunTerminalState,unifiedRunAvailability } from './unifiedLinuxClient';
export type {UnifiedLinuxClientConfig} from './unifiedLinuxClient';
/** Presentation-only split. The server still owns all PTYs, quota and access.
 * Python runs are excluded: the original Run/Stop path must remain unchanged. */
export function unifiedSplitTarget(active:string, second:string, terminals:readonly {terminalId:string;kind?:string;connected:boolean}[]):string|null {
  if(!active||!second||active===second)return null;
  const eligible=(id:string)=>terminals.some(t=>t.terminalId===id&&!t.kind&&t.connected);
  return eligible(active)&&eligible(second)?second:null;
}
export function unifiedSplitChoice(active:string, terminals:readonly {terminalId:string;kind?:string;connected:boolean}[]):string|null {
  if(!terminals.some(t=>t.terminalId===active&&!t.kind&&t.connected))return null;
  return terminals.find(t=>t.terminalId!==active&&!t.kind&&t.connected)?.terminalId??null;
}
const button='rounded border border-neutral-300 px-2 py-1 text-xs font-semibold disabled:opacity-40 dark:border-white/20';
function safeMessage(error:unknown){return error instanceof Error&&/^[A-Z0-9_]{1,100}$/.test(error.message)?error.message:'UNIFIED_REQUEST_UNAVAILABLE';}
function TerminalSurface({config,owner,id,active,onExit,disabled,pythonRun=false,onInterruptReady}:{config:UnifiedLinuxClientConfig;owner:UnifiedOwner;id:string;active:boolean;onExit:()=>void;disabled:boolean;pythonRun?:boolean;onInterruptReady?:(id:string,interrupt:(()=>boolean)|null)=>void}){
  const [feed,setFeed]=React.useState<TerminalChunk[]>([]);
  const [state,setState]=React.useState<'connecting'|'ready'|'reconnecting'|'blocked'|'exited'>('connecting');
  const [gap,setGap]=React.useState(false);const [notice,setNotice]=React.useState('');const [retry,bump]=React.useState(0);
  const socketRef=React.useRef<WebSocket|null>(null),inputReady=React.useRef(false),last=React.useRef(0),size=React.useRef<string|null>(null),exitRef=React.useRef(onExit);
  exitRef.current=onExit;
  React.useEffect(()=>{
    let live=true,stopped=false,attempt=0,readyAt=0,lastPong=0,timer:ReturnType<typeof setTimeout>|undefined,deadline:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,request:AbortController|undefined;
    let ws:WebSocket|null=null;
    const current=(s:WebSocket)=>live&&!stopped&&ws===s;
    function clear(){inputReady.current=false;clearTimeout(deadline);clearInterval(heartbeat);}
    function stop(message:string,exited=false){if(!live||stopped)return;stopped=true;clear();clearTimeout(timer);request?.abort();ws?.close();socketRef.current=null;setNotice(message);setState(exited?'exited':'blocked');if(exited)exitRef.current();}
    function retryLater(){if(!live||stopped)return;clear();if(readyAt&&Date.now()-readyAt>=stableConnectionMs)attempt=0;readyAt=0;
      if(attempt>=reconnectDelaysMs.length){stop('Unable to reconnect. Check ownership or reconnect manually. Your Linux environment has not been ended.');return;}
      setState('reconnecting');timer=setTimeout(()=>void connect(),reconnectDelaysMs[attempt++]);}
    async function connect(){if(!live||stopped)return;
      const controller=new AbortController();request=controller;const requestTimeout=setTimeout(()=>controller.abort(),transportTimeoutMs);
      try{
        const response=await unifiedRequest(config,{action:'attach',...owner,terminalId:id},controller.signal);
        if(!live||stopped)return;if(controller.signal.aborted)throw Error('ATTACH_TIMEOUT');
        const s=new WebSocket(unifiedSocketUrl(config,location.origin,id,response));ws=s;socketRef.current=s;const replay=new UnifiedReplay(last.current);
        deadline=setTimeout(()=>{if(current(s))s.close();},transportTimeoutMs);
        s.onmessage=event=>{if(!current(s))return;try{
          const r=replay.accept(parseUnifiedFrame(event.data,id));
          if(r.seq!==undefined)last.current=r.seq;
          if(r.output!==undefined&&r.seq!==undefined){const chunk:TerminalChunk={id:r.seq,kind:'pty',data:r.output};setFeed(prev=>[...prev,chunk].slice(-600));}
          if(r.gap)setGap(true);
          if(r.exit){stop('Shell exited. The Linux environment remains running.',true);return;}
          if(r.pong)lastPong=Date.now();
          if(r.ready){clearTimeout(deadline);readyAt=lastPong=Date.now();inputReady.current=true;setNotice('');setState('ready');if(size.current)s.send(size.current);heartbeat=setInterval(()=>{if(!current(s))return;if(Date.now()-lastPong>=heartbeatDeadlineMs||s.readyState!==WebSocket.OPEN){s.close();return;}try{s.send('{"type":"ping"}');}catch{s.close();}},heartbeatIntervalMs);}
        }catch{stop('Terminal output could not be verified. Reconnect manually.');}};
        s.onerror=()=>{if(current(s))s.close();};
        s.onclose=event=>{if(!current(s))return;ws=null;socketRef.current=null;clear();if(event.code===1008){stop('Terminal access changed. Check environment ownership.');exitRef.current();}else if(event.code===1000&&event.reason==='Terminal completed'){stop('Shell exited. The Linux environment remains running.',true);}else retryLater();};
      }catch{if(live&&!stopped)retryLater();}finally{clearTimeout(requestTimeout);if(request===controller)request=undefined;}
    }
    setState('connecting');setNotice('');void Promise.resolve().then(connect);
    return()=>{live=false;stopped=true;clear();clearTimeout(timer);request?.abort();if(ws){ws.onmessage=null;ws.onclose=null;ws.onerror=null;ws.close();}socketRef.current=null;};
  },[config.apiPath,config.wsPrefix,config.wsOrigin,owner.windowId,owner.environmentId,owner.windowGeneration,id,retry]);
  const send=React.useCallback((data:string)=>{const ws=socketRef.current;if(disabled||!inputReady.current||ws?.readyState!==WebSocket.OPEN)return false;const frame=unifiedInputFrame(data);if(!frame){setNotice('Input too large; paste smaller chunks. Nothing was resent.');return false;}if(ws.bufferedAmount>256*1024){setNotice('Terminal connection is busy; reconnecting without replaying input.');ws.close();return false;}try{ws.send(frame);return true;}catch{ws.close();return false;}},[disabled]);
  React.useLayoutEffect(()=>{
    if(!pythonRun||!onInterruptReady||disabled||state!=='ready')return;
    onInterruptReady(id,()=>send("\x03"));
    return()=>onInterruptReady(id,null);
  },[pythonRun,onInterruptReady,disabled,state,id,send]);
  const resize=(cols:number,rows:number)=>{const frame=unifiedResizeFrame(cols,rows);if(!frame)return;size.current=frame;const ws=socketRef.current;if(!disabled&&inputReady.current&&ws?.readyState===WebSocket.OPEN)try{ws.send(frame);}catch{ws.close();}};
  // Keep every PTY transport alive across tab switches, but only mount the active Xterm renderer.
  if(!active)return null;
  return <div className="flex min-h-0 flex-1 flex-col" data-testid="unified-terminal-surface">
    {(state!=='ready'||gap||notice)&&<div role="status" className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs"><span>{state}</span>{gap&&<span>Some earlier output is no longer retained.</span>}{notice&&<span>{notice}</span>}{state==='blocked'&&<button className={button} disabled={disabled} onClick={()=>bump(v=>v+1)}>Reconnect terminal</button>}</div>}
    {pythonRun&&!onInterruptReady&&<div className="px-2 py-1"><button type="button" className={button} disabled={disabled||state!=='ready'} onClick={()=>send("\x03")}>Interrupt Python (Ctrl+C)</button></div>}
    <div className="min-h-0 flex-1"><XtermTerminal terminalFeed={feed} inputEnabled={state==='ready'&&!disabled} interactiveReady={state==='ready'&&!disabled} busy={state==='connecting'||state==='reconnecting'} disabled={disabled} lastResult={null} onSendData={send} onResize={resize} optimisticLocalEcho={false} disableDevInputProbe /></div>
  </div>;
}
/** Completed program output uses the same original Xterm renderer without a live PTY. */
function CompletedRunSurface({run}:{run:UnifiedCompletedRun}){
  const feed=React.useMemo<TerminalChunk[]>(()=>[{id:1,kind:'pty',data:run.output}],[run.output]);
  return <div className="flex min-h-0 flex-1 flex-col" data-testid="unified-completed-run">
    <div className="min-h-0 flex-1" aria-label="Completed Python output"><XtermTerminal terminalFeed={feed} inputEnabled={false} interactiveReady={false} busy={false} disabled={false} lastResult={null} onSendData={()=>{}} onResize={()=>{}} optimisticLocalEcho={false} disableDevInputProbe /></div>
  </div>;
}
/** Actual learner Xterm UI; explicit mounting by trusted host only. No legacy
 * controllers, synthetic authentication, implicit reset, or auto-open on mount. */
export default function UnifiedLinuxTerminalPanel({config,disabled=false,embedded=false,onOwnerChange,hasUnsavedDrafts,preferredTerminalId,onRunTerminalState}:{config:UnifiedLinuxClientConfig;disabled?:boolean;embedded?:boolean;onOwnerChange?:(owner:UnifiedOwner|null)=>void;hasUnsavedDrafts?:()=>boolean;preferredTerminalId?:string;onRunTerminalState?:(state:UnifiedRunTerminalState|null)=>void}){
  const layout=React.useContext(WorkspaceTerminalLayoutContext);
  const [windowId,setWindowId]=React.useState('');const [status,setStatus]=React.useState<UnifiedStatus|null>(null);const [statusStale,setStatusStale]=React.useState(false);const [active,setActive]=React.useState('');const [splitWith,setSplitWith]=React.useState('');const [busy,setBusy]=React.useState(false);const [checking,setChecking]=React.useState(false);const [pendingTerminal,setPendingTerminal]=React.useState(false);const [error,setError]=React.useState('');
  const mounted=React.useRef(false),inflight=React.useRef<AbortController|null>(null),statusRef=React.useRef<UnifiedStatus|null>(null);
  const [dismissed,setDismissed]=React.useState<ReadonlySet<string>>(()=>new Set());
  const [shellExitMessage,setShellExitMessage]=React.useState('');
  const shellExitTarget=React.useRef('');
  const applyStatus=React.useCallback((s:UnifiedStatus|null)=>{statusRef.current=s;setStatus(s);setStatusStale(false);
    if(s?.status==='current')setActive(x=>s.terminals.some(t=>t.terminalId===x)||(s.recentRuns??[]).some(t=>t.terminalId===x&&!dismissed.has(t.terminalId))?x:s.terminals[0]?.terminalId??(s.recentRuns??[]).find(t=>!dismissed.has(t.terminalId))?.terminalId??'');
    else setActive('');},[dismissed]);
  const perform=React.useCallback(async(action?:UnifiedAction)=>{
    if(!windowId||!mounted.current||inflight.current)return;
    const controller=new AbortController();inflight.current=controller;setChecking(true);if(action){setBusy(true);setPendingTerminal(action.action==='terminal');}const timeout=setTimeout(()=>controller.abort(),action?.action==='end'&&action.intent==='reset'?90_000:30000);
    let resetAcknowledged=false;
    try{
      let selected:string|undefined;
      // Reset is the sole action that can create a new environment after
      // destructive teardown. End remains end-only. Fresh admission is always
      // independently verified; no implicit retry on timeout or 403.
      if(action?.action==='end'&&action.intent==='reset'){
        const old={windowId:action.windowId,environmentId:action.environmentId,windowGeneration:action.windowGeneration};
        const fresh=await verifiedUnifiedResetAndReopen(config,old,controller.signal,()=>{
          resetAcknowledged=true;
          if(mounted.current&&inflight.current===controller)applyStatus({status:'absent'});
        });
        if(!mounted.current||inflight.current!==controller||controller.signal.aborted)return;
        applyStatus(fresh);setError('');return;
      }
      if(action){const response=await unifiedRequest(config,action,controller.signal);if(action.action==='terminal'&&typeof response.terminalId==='string')selected=response.terminalId;if(action.action==='shellExit'&&response.pending===true)shellExitTarget.current=action.terminalId;}
      const s=parseUnifiedStatus(await unifiedRequest(config,{action:'status',windowId},controller.signal));
      if(!mounted.current||inflight.current!==controller)return;applyStatus(s);if(selected&&s.status==='current'&&s.terminals.some(t=>t.terminalId===selected))setActive(selected);
      if(shellExitTarget.current&&s.status==='current'){
        if(s.terminals.some(t=>t.terminalId===shellExitTarget.current))setShellExitMessage('Shell EOF requested. Awaiting verified exit; if a program is active, return to the shell and type exit.');
        else{shellExitTarget.current='';setShellExitMessage('Shell exit verified; terminal slot released.');}
      }else if(s.status!=='current'){shellExitTarget.current='';setShellExitMessage('');}
      setError('');
    }catch(e){if(mounted.current&&inflight.current===controller){
      // Network/status failure is not an authenticated 'absent' response.
      // Keep the terminal UI and draft owner visible, but stop new actions
      // until a fresh server status is verified; server checks remain final.
      if(resetAcknowledged){
        // Old environment was destroyed. Do not restore its old owner or
        // claim a replacement exists; manual status/open is still available.
        setStatusStale(false);
        setError('Previous environment was removed, but a fresh environment was not verified ('+safeMessage(e)+'). Check status, then use Open Linux environment. If this disposable pilot expired, start a new pilot. No automatic retry was attempted.');
      }else{setStatusStale(true);setError(safeMessage(e)+' — Last verified state retained. Actions paused until status recovers; no action was retried.');}}}
    finally{clearTimeout(timeout);if(inflight.current===controller){inflight.current=null;if(mounted.current){setBusy(false);setChecking(false);setPendingTerminal(false);}}}
  },[config.apiPath,config.wsPrefix,config.wsOrigin,windowId,applyStatus]);
  React.useEffect(()=>{mounted.current=true;setWindowId(unifiedDocumentWindowId());return()=>{mounted.current=false;inflight.current?.abort();inflight.current=null;};},[]);
  React.useEffect(()=>{if(!windowId)return;void perform();const refresh=()=>{if(document.visibilityState==='visible')void perform();};
    const t=setInterval(()=>{if(document.visibilityState==='visible'&&statusRef.current)void perform();},5000);
    document.addEventListener('visibilitychange',refresh);
    return()=>{clearInterval(t);document.removeEventListener('visibilitychange',refresh);};},[windowId,perform]);
  const consumedSelection=React.useRef('');
  React.useEffect(()=>{if(!preferredTerminalId||consumedSelection.current===preferredTerminalId)return;if(status?.status==='current'&&(status.terminals.some(t=>t.terminalId===preferredTerminalId)||(status.recentRuns??[]).some(t=>t.terminalId===preferredTerminalId&&!dismissed.has(t.terminalId)))){consumedSelection.current=preferredTerminalId;setSplitWith('');setActive(preferredTerminalId);}},[status,preferredTerminalId,dismissed]);
  React.useEffect(()=>{if(preferredTerminalId)void perform();},[preferredTerminalId,perform]);
  const owner=status?.status==='current'?{windowId,environmentId:status.environmentId,windowGeneration:status.windowGeneration}:null;
  // Publish only current, server-verified ownership. Stable across terminal polling.
  const ownerEnvironment=owner?.environmentId,ownerGeneration=owner?.windowGeneration;
  React.useLayoutEffect(()=>{
    onOwnerChange?.(!disabled&&ownerEnvironment&&ownerGeneration!==undefined?{windowId,environmentId:ownerEnvironment,windowGeneration:ownerGeneration}:null);
    return()=>onOwnerChange?.(null);
  },[onOwnerChange,disabled,windowId,ownerEnvironment,ownerGeneration]);
  React.useEffect(()=>{setDismissed(new Set());setSplitWith('');consumedSelection.current='';shellExitTarget.current='';setShellExitMessage('');},[ownerEnvironment,ownerGeneration]);
  const recentRuns=status?.status==='current'?(status.recentRuns??[]).filter(r=>!dismissed.has(r.terminalId)):[];
  const verifiedTerminals=status?.status==='current'?status.terminals:[];
  const splitRightId=unifiedSplitTarget(active,splitWith,verifiedTerminals);
  const maySplit=!!unifiedSplitChoice(active,verifiedTerminals);
  const selectTab=React.useCallback((id:string)=>{
    if(splitRightId&&id===splitRightId)setSplitWith(active); // exchange primary and secondary shells
    else if(splitRightId&&id!==active)setSplitWith(''); // Python Run or other tab: one pane
    setActive(id);
  },[splitRightId,active]);
  function toggleSplit(){
    if(disabled||statusStale||busy||checking||status?.status!=='current')return;
    if(splitRightId){setSplitWith('');return;}
    const second=unifiedSplitChoice(active,status.terminals);
    if(second)setSplitWith(second);
  }
  const [interruptTarget,setInterruptTarget]=React.useState<{id:string;invoke:()=>boolean}|null>(null);
  const registerInterrupt=React.useCallback((id:string,invoke:(()=>boolean)|null)=>{
    setInterruptTarget(previous=>invoke?{id,invoke}:previous?.id===id?null:previous);
  },[]);
  React.useLayoutEffect(()=>{
    if(!onRunTerminalState)return;
    if(disabled||statusStale||!ownerEnvironment||ownerGeneration===undefined){onRunTerminalState(null);return;}
    const availability=unifiedRunAvailability(status,busy||checking);
    const target=interruptTarget?.id===availability.terminalId?interruptTarget:null;
    onRunTerminalState({owner:{windowId,environmentId:ownerEnvironment,windowGeneration:ownerGeneration},...availability,
      canStop:!!target&&!busy,interrupt:()=>!!target&&!busy&&target.invoke()});
  },[onRunTerminalState,disabled,ownerEnvironment,ownerGeneration,windowId,status,statusStale,busy,checking,interruptTarget]);
  React.useLayoutEffect(()=>()=>onRunTerminalState?.(null),[onRunTerminalState]);
  function transfer(){if(disabled||statusStale||busy||status?.status!=='conflict')return;if(window.confirm('Transfer ownership to this window? Files and running processes will be preserved.'))void perform({action:'transfer',windowId,environmentId:status.environmentId,windowGeneration:status.windowGeneration,previousWindowId:status.currentWindowId,confirmed:true});}
  function end(intent:'end'|'reset'){if(disabled||statusStale||busy||!owner)return;if(hasUnsavedDrafts?.()){window.alert('Save or discard unsaved Monaco drafts before ending or resetting. Download them first if needed.');return;}if(window.confirm(intent==='reset'?'Permanently destroy this disposable Linux environment and its files, then request a NEW environment with fresh authorization? Any failed re-entry will need manual recovery.':'End this disposable Linux environment? All its terminals, processes and unsaved files will be removed.'))void perform({action:'end',...owner,confirmed:true,intent});}
  function closeTab(id:string){
    if(recentRuns.some(r=>r.terminalId===id)){setDismissed(p=>new Set([...p,id]));setActive(current=>current===id?status?.status==='current'?status.terminals[0]?.terminalId??recentRuns.find(r=>r.terminalId!==id)?.terminalId??'':'':current);return;}
    const shell=status?.status==='current'?status.terminals.find(t=>t.terminalId===id&&!t.kind&&t.connected):undefined;
    if(!shell||!owner||disabled||busy||checking||statusStale||shellExitTarget.current===id)return;
    if(!window.confirm('Request Ctrl+D to close this selected Linux shell? A running program may consume EOF instead; the shell and its terminal quota stay until the Runner verifies process exit.'))return;
    void perform({action:'shellExit',...owner,terminalId:id});
  }
  return <section data-testid="unified-linux-panel" className={`flex h-full flex-col overflow-hidden ${embedded?"min-h-0":"min-h-[280px] border border-neutral-200 dark:border-white/10"}`}>
    <WorkspaceTerminalToolbar tabs={status?.status==='current'?[...status.terminals.map((t,i)=>({id:t.terminalId,label:t.kind==='python'?'Python Run':`Terminal ${i+1}`,live:t.connected,closeable:!t.kind&&t.connected&&shellExitTarget.current!==t.terminalId})),...recentRuns.map(t=>({id:t.terminalId,label:'Python Run · completed',live:false,closeable:true}))]:[]} activeId={active||null}
      onSelect={selectTab} onClose={closeTab} onAdd={()=>{if(owner)void perform({action:'terminal',...owner});}} addDisabled={disabled||statusStale||checking||!owner||status?.status!=='current'||status.terminalCount>=status.maxTerminals}
      addTitle={status?.status==='current'?`New terminal (${status.terminalCount}/${status.maxTerminals} active)`:'Open Linux environment first'}
      pendingLabel={pendingTerminal&&status?.status==='current'?`Terminal ${status.terminals.length+1}`:undefined}
      trailing={<>
        <button type="button" className={button} data-testid="unified-split-toggle" aria-pressed={!!splitRightId}
          aria-label={splitRightId?'Unsplit Linux terminals':'Split Linux terminals'}
          title={maySplit?'Display two existing Linux shells side by side':'Open two Linux shells to enable split'}
          disabled={disabled||statusStale||busy||checking||(!splitRightId&&!maySplit)} onClick={toggleSplit}>
          {splitRightId?'Unsplit':'Split'}
        </button>
        <span className="shrink-0 text-[10px] font-semibold text-neutral-500 dark:text-white/45" title="Environments / terminal capacity">{status?.status==='current'?`1 env · ${status.terminalCount}/${status.maxTerminals}`:status?.status==='absent'?'0 env':'—/—'}</span>
        <details className="relative shrink-0" data-testid="unified-environment-menu">
          <summary className={`${button} cursor-pointer list-none`} aria-label="Linux environment options" title="Linux environment options">Environment</summary>
          <div className="absolute right-0 top-full z-30 mt-1 flex min-w-[220px] flex-col gap-2 rounded border border-neutral-200 bg-white p-2 shadow-lg dark:border-white/20 dark:bg-neutral-900" role="group" aria-label="Linux environment controls">
            <button type="button" className={button} onClick={()=>void perform()} disabled={checking||!windowId}>Check status</button>
            {owner&&<>
              <span className="text-xs text-neutral-500 dark:text-white/55">Disposable Linux · full privileges pilot</span>
              <button type="button" className={button} disabled={disabled||statusStale||checking} onClick={()=>end('end')}>End environment</button>
              {status?.status==='current'&&status.resetAllowed&&<button type="button" className={button} disabled={disabled||statusStale||checking} onClick={()=>end('reset')}>Reset environment</button>}
            </>}
          </div>
        </details>
        {layout.maximize&&<button type="button" className={button} aria-label={layout.maximized?'Restore editor and terminal':'Maximize terminal'} title={layout.maximized?'Restore split':'Maximize terminal'} onClick={layout.maximize}>{layout.maximized?'↙':'↗'}</button>}
        {layout.collapse&&<button type="button" className={button} aria-label="Collapse terminal" title="Collapse terminal" onClick={layout.collapse}>↓</button>}
      </>}/>
    {error&&<p role="alert" className="p-2 text-xs text-red-600">{error}</p>}
    {shellExitMessage&&<p role="status" className="p-2 text-xs text-neutral-600 dark:text-white/65">{shellExitMessage}</p>}
    {busy&&<p role="status" className="p-2 text-xs">Working…</p>}
    {status?.status==='absent'&&<div className="space-y-2 p-4 text-sm"><p>Start one Linux environment and open independent terminals inside it.</p><button className={button} disabled={disabled||checking} onClick={()=>void perform({action:'open',windowId})}>Open Linux environment</button></div>}
    {status?.status==='conflict'&&<div className="space-y-2 p-4 text-sm"><p>Your Linux environment is owned by another window or a previous page instance. Your work remains in that environment.</p><button className={button} disabled={disabled||statusStale||checking} onClick={transfer}>Transfer session</button></div>}
    {status?.status==='current'&&owner&&<>
    {status.terminals.length===0&&recentRuns.length===0&&<p className="p-4 text-sm">Environment running. Use New terminal (+) to open a shell.</p>}
    {status.terminalCount>status.terminals.length&&<p className="p-2 text-xs">Some terminal slots are awaiting verified exit. No replacement shell is started automatically.</p>}
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">{config.workspaceRead&&!disabled&&<UnifiedLinuxWorkspaceExplorer key={`${owner.environmentId}:${owner.windowGeneration}`} config={config} owner={owner} disabled={busy||statusStale}/>}<div className={`flex min-w-0 min-h-0 flex-1 ${splitRightId?'flex-col lg:flex-row':'flex-col'}`} data-testid="unified-terminal-viewport" data-split={!!splitRightId}>{!disabled&&status.terminals.map(t=>{
      // Keep both WebSocket session controllers mounted even when hidden.
      // Split only changes presentation; terminal IDs, quota and ownership are unchanged.
      const shown=active===t.terminalId||splitRightId===t.terminalId;
      return <div key={`${owner.environmentId}:${owner.windowGeneration}:${t.terminalId}`} className={`${shown?'flex':'hidden'} min-w-0 min-h-0 flex-1 flex-col ${splitRightId===t.terminalId?'border-t border-neutral-300 lg:border-l lg:border-t-0 dark:border-white/20':''}`}>
        {shown&&splitRightId&&<div className="shrink-0 border-b border-neutral-200 px-2 py-1 text-xs font-semibold dark:border-white/10" aria-label="Split shell pane">{t.terminalId===active?'Primary shell':'Secondary shell'}</div>}
        <TerminalSurface config={config} owner={owner} id={t.terminalId} pythonRun={t.kind==='python'} onInterruptReady={onRunTerminalState&&t.kind==='python'?registerInterrupt:undefined} active={shown} onExit={()=>void perform()} disabled={disabled||busy||statusStale||layout.visible===false}/>
      </div>;
    })}{!disabled&&!splitRightId&&recentRuns.map(run=>active===run.terminalId?<CompletedRunSurface key={`${owner.environmentId}:${owner.windowGeneration}:${run.terminalId}`} run={run}/>:null)}</div></div></>}
  </section>;
}
