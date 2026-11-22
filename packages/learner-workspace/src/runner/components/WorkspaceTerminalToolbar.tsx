"use client";
import React from "react";
import { cx } from "@zoeskoul/learner-workspace/tools/utils/cx";
export const WORKSPACE_TERMINAL_TABS_PANEL = "border-b border-neutral-200 bg-white/88 dark:border-white/10 dark:bg-black/25";
export const MOBILE_TAB_IDLE = "text-[rgb(var(--ui-text-muted)/0.9)] hover:bg-[rgb(var(--ui-hover)/0.72)] hover:text-[rgb(var(--ui-text)/1)]";
export const MOBILE_TAB_ACTIVE = "border border-[rgb(var(--ui-border-strong)/0.72)] bg-[rgb(var(--ui-surface-3)/0.82)] text-[rgb(var(--ui-text)/1)]";
export const WorkspaceTerminalLayoutContext=React.createContext<{collapse?:()=>void;maximize?:()=>void;maximized?:boolean;visible?:boolean}>({});
type Props={tabs:readonly {id:string;label:string;live:boolean;closeable?:boolean}[];activeId:string|null;pendingLabel?:string;onSelect:(id:string)=>void;onClose?:(id:string)=>void;onAdd:()=>void;addDisabled:boolean;addTitle:string;leading?:React.ReactNode;trailing?:React.ReactNode;message?:React.ReactNode};
/** The original FullIDE terminal tab strip. Session controllers own their own
 * lifecycle and capacity; presentation never performs a legacy API call. */
export default function WorkspaceTerminalToolbar({tabs,activeId,pendingLabel,onSelect,onClose,onAdd,addDisabled,addTitle,leading,trailing,message}:Props){
 return <div className={cx("p-2",WORKSPACE_TERMINAL_TABS_PANEL)} data-testid="workspace-terminal-toolbar">
  <div className="flex min-w-0 items-center gap-2">{leading}
   <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
    {tabs.map(tab=>{const active=tab.id===activeId;return <div key={tab.id} className={cx("inline-flex shrink-0 items-center rounded-lg",active?MOBILE_TAB_ACTIVE:MOBILE_TAB_IDLE)}>
     <button type="button" onClick={()=>onSelect(tab.id)} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold" aria-pressed={active}><span>{tab.label}</span>{tab.live?<span className="inline-flex h-2 w-2 rounded-full bg-emerald-500"/>:null}</button>
     {onClose&&(tab.closeable===true||(tab.closeable!==false&&tabs.length>1))?<button type="button" onClick={()=>onClose(tab.id)} className="px-1.5 py-1 text-xs opacity-70 hover:opacity-100" aria-label={`Close ${tab.label}`}>×</button>:null}
    </div>})}
    {pendingLabel?<div role="status" aria-live="polite" aria-label={`Opening ${pendingLabel}`} className={cx("inline-flex h-8 w-24 shrink-0 items-center justify-center rounded-lg",MOBILE_TAB_IDLE)}><span aria-hidden="true" className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-60"/><span className="sr-only">Opening {pendingLabel}</span></div>:null}
   </div>
   <button type="button" onClick={onAdd} disabled={addDisabled} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-base font-bold text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/80" aria-label="New terminal" title={addTitle}>+</button>
   {trailing}
  </div>
  {message?<div className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300">{message}</div>:null}
 </div>;
}
