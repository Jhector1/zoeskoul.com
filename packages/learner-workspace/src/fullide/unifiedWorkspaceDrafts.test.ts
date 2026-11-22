import {describe,it,expect} from 'vitest';
import {UnifiedDrafts,verifiedUnifiedSavedDraft,validUnifiedPath,validUnifiedText,sameOwner,workspacePath} from './unifiedWorkspaceDrafts';
import type {WorkspaceStateV2} from '../ide/types';
const ws=(text='old'):WorkspaceStateV2=>({version:2,language:'bash',nodes:[{id:'folder',name:'projects',parentId:null,kind:'folder',createdAt:0,updatedAt:0},{id:'file',name:'main.py',parentId:'folder',kind:'file',content:text,createdAt:0,updatedAt:0}],activeFileId:'file',entryFileId:'file',openTabs:['file'],expanded:['folder'],stdin:'',leftPct:26});
describe('unified draft boundary',()=>{
 it('preserves draft on refresh without altering saved snapshot',()=>{const d=new UnifiedDrafts(),g=ws();expect(d.edit(g,'file','new')).toBe(true);expect(d.overlay(g).nodes[1]).toMatchObject({content:'new'});expect(g.nodes[1]).toMatchObject({content:'old'});});
 it('detects external changes and preserves typed text',()=>{const d=new UnifiedDrafts();d.edit(ws(),'file','mine');expect(d.conflict(d.list()[0],ws('terminal'))).toBe(true);expect(d.overlay(ws('terminal')).nodes[1]).toMatchObject({content:'mine'});});
 it('retains removed file draft without inventing a guest file',()=>{const d=new UnifiedDrafts();d.edit(ws(),'file','mine');const removed={...ws(),nodes:[]};expect(d.conflict(d.list()[0],removed)).toBe(true);expect(d.overlay(removed).nodes).toEqual([]);expect(d.list()[0].text).toBe('mine');});
 it('does not discard newer typing on save acknowledgement',()=>{const d=new UnifiedDrafts();d.edit(ws(),'file','one');d.edit(ws(),'file','two');d.acknowledge('file','one');expect(d.list()[0].text).toBe('two');d.acknowledge('file','two');expect(d.list()).toEqual([]);});
 it('discard restores saved version',()=>{const d=new UnifiedDrafts();d.edit(ws(),'file','mine');d.discard('file');expect(d.overlay(ws('terminal')).nodes[1]).toMatchObject({content:'terminal'});});
 it('revert exact base clears draft only if guest still matches',()=>{const d=new UnifiedDrafts();d.edit(ws(),'file','new');d.edit(ws(),'file','old');expect(d.list()).toEqual([]);d.edit(ws(),'file','new');d.edit(ws('terminal'),'file','old');expect(d.list()).toHaveLength(1);});
 it('validates text by UTF8 bytes',()=>{expect(validUnifiedText('é'.repeat(16384))).toBe(true);expect(validUnifiedText('é'.repeat(16385))).toBe(false);expect(validUnifiedText('a\0')).toBe(false);});
 it('validates full paths',()=>{for(const path of ['','../a','/a','.secret','dir/.secret','a//b','node_modules/x','a\n','x'.repeat(129)])expect(validUnifiedPath(path)).toBe(false);expect(validUnifiedPath('projects/main.py')).toBe(true);});
 it('resolves exact parent ids and denies unknown files',()=>{const d=new UnifiedDrafts();expect(workspacePath(ws(),'file')).toBe('projects/main.py');expect(d.edit(ws(),'missing','no')).toBe(false);expect(d.edit(ws(),'folder','no')).toBe(false);});
 it('requires authoritative exact save readback before draft acknowledgment',()=>{
  const drafts=new UnifiedDrafts();const initial=ws('old');
  expect(drafts.edit(initial,'file','new')).toBe(true);
  const sent={...drafts.list()[0]};
  expect(verifiedUnifiedSavedDraft(sent,initial)).toBe(false);
  expect(drafts.list()).toHaveLength(1);
  expect(verifiedUnifiedSavedDraft(sent,ws('new'))).toBe(true);
  drafts.acknowledge(sent.id,sent.text);
  expect(drafts.list()).toHaveLength(0);
 });
 it('rejects missing, substituted, corrupted, or binary save readback',()=>{
  const draft={id:'file',path:'projects/main.py',base:'old',text:'new'};
  expect(verifiedUnifiedSavedDraft(draft,null)).toBe(false);
  expect(verifiedUnifiedSavedDraft(draft,{...ws('new'),nodes:[]})).toBe(false);
  expect(verifiedUnifiedSavedDraft(draft,{...ws('new'),nodes:[{...ws('new').nodes[1],name:'other.py'}]})).toBe(false);
  expect(verifiedUnifiedSavedDraft(draft,{...ws('new'),nodes:ws('new').nodes.map((n:WorkspaceStateV2['nodes'][number])=>n.kind==='file'?{...n,binary:{encoding:'base64',data:'AA==',sizeBytes:1}}:n)})).toBe(false);
  expect(verifiedUnifiedSavedDraft(draft,ws('partial'))).toBe(false);
 });
 it('preserves newer user text if a previously sent revision is acknowledged',()=>{
  const drafts=new UnifiedDrafts(),g=ws('old');drafts.edit(g,'file','sent');
  const sent={...drafts.list()[0]};drafts.edit(g,'file','newer');
  expect(verifiedUnifiedSavedDraft(sent,ws('sent'))).toBe(true);
  drafts.acknowledge(sent.id,sent.text);
  expect(drafts.list()[0].text).toBe('newer');
 });
 it('fences different environment generations',()=>{const a={environmentId:'env_a',windowId:'window-a',windowGeneration:1};expect(sameOwner(a,{...a})).toBe(true);expect(sameOwner(a,{...a,windowGeneration:2})).toBe(false);expect(sameOwner(a,null)).toBe(false);});
});
