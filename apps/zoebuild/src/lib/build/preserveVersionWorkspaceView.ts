import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";

type Node = WorkspaceStateV2["nodes"][number];
function pathFor(nodes:readonly Node[],id:string|null|undefined):string|null {
  if(!id)return null;const byId=new Map(nodes.map(n=>[n.id,n]));
  const parts:string[]=[];const seen=new Set<string>();let n=byId.get(id);
  while(n){if(seen.has(n.id)||parts.length>20)return null;seen.add(n.id);parts.unshift(n.name);n=n.parentId?byId.get(n.parentId):undefined;}
  return parts.length?parts.join("/"):null;
}
/** Keep only UI presentation state while replacing source with exact server snapshot.
 * Match files by paths because historical snapshots can assign different node IDs.
 * Removed files are never kept as phantom tabs and no prior file contents survive.
 */
export function preserveVersionWorkspaceView(next:WorkspaceStateV2,previous:WorkspaceStateV2|null):WorkspaceStateV2 {
  if(!previous)return next;
  const validFiles=new Map<string,string>();
  for(const n of next.nodes)if(n.kind==="file"){
    const path=pathFor(next.nodes,n.id);if(path)validFiles.set(path,n.id);
  }
  const openTabs=[...new Set(previous.openTabs.map(id=>validFiles.get(pathFor(previous.nodes,id)??"")).filter((id):id is string=>Boolean(id)))];
  const selected=validFiles.get(pathFor(previous.nodes,previous.activeFileId)??"");
  const validIds=new Set(validFiles.values());
  // WorkspaceStateV2 requires a non-null activeFileId. Keep the exact target
  // snapshot's selection when valid, then its entry file, then another target
  // file. Never reuse a previous version's file ID (or its file contents).
  const fallback=validIds.has(next.activeFileId)?next.activeFileId:
    validIds.has(next.entryFileId)?next.entryFileId:
    validIds.values().next().value??next.activeFileId;
  const activeFileId=selected??fallback;
  if(validIds.has(activeFileId)&&!openTabs.includes(activeFileId))openTabs.push(activeFileId);
  const targetTabs=next.openTabs.filter(id=>validIds.has(id));
  return {...next,openTabs:openTabs.length?openTabs:targetTabs,
    activeFileId,
    leftPct:Number.isFinite(previous.leftPct)&&previous.leftPct>=0&&previous.leftPct<=100?previous.leftPct:next.leftPct};
}
