import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { invalidateManagedDependenciesOnManifestEdit } from "./invalidateManagedDependenciesOnManifestEdit";

const packageV1=JSON.stringify({packageManager:"pnpm@10.33.0",dependencies:{react:"19.2.3"}});
const packageV2=JSON.stringify({packageManager:"pnpm@10.33.0",dependencies:{react:"19.2.3","lucide-react":"0.468.0"}});
const ws=(pkg:string):WorkspaceStateV2=>({
  version:2,language:"web",nodes:[
    {id:"pkg",kind:"file",parentId:null,name:"package.json",content:pkg,createdAt:1,updatedAt:1},
    {id:"lock",kind:"file",parentId:null,name:"pnpm-lock.yaml",content:"lock",createdAt:1,updatedAt:1},
    {id:"seal",kind:"file",parentId:null,name:"zoebuild-dependency-approval.json",content:"seal",createdAt:1,updatedAt:1},
    {id:"app",kind:"file",parentId:null,name:"App.tsx",content:"hi",createdAt:1,updatedAt:1},
  ],openTabs:["app","lock"],activeFileId:"lock",entryFileId:"app",
  stdin:"",expanded:[],leftPct:25,
});

describe("K16 owner package changes",()=>{
  it("retains a previous valid seal when the manifest is unchanged",()=>{
    const incoming=ws(packageV1);
    expect(invalidateManagedDependenciesOnManifestEdit(ws(packageV1),incoming)).toBe(incoming);
  });
  it("does not reinstall when only scripts or formatting change",()=>{
    const incoming=ws(JSON.stringify({packageManager:"pnpm@10.33.0",scripts:{build:"vite build"},dependencies:{react:"19.2.3"}},null,2));
    expect(invalidateManagedDependenciesOnManifestEdit(ws(packageV1),incoming)).toBe(incoming);
  });
  it("retires old lock and seal when a new manifest is explicitly saved",()=>{
    const next=invalidateManagedDependenciesOnManifestEdit(ws(packageV1),ws(packageV2));
    expect(next.nodes.map(node=>node.name)).toEqual(["package.json","App.tsx"]);
    expect(next.activeFileId).toBe("pkg");
    expect(next.openTabs).toEqual(["app"]);
    const pkg=next.nodes.find(node=>node.name==="package.json");
    expect(pkg?.kind === "file" ? pkg.content : null).toBe(packageV2);
  });
  it("does not hide a lock-only tamper or changed signature",()=>{
    const incoming=ws(packageV1);
    const modified= {...incoming,nodes:incoming.nodes.map(node=>
      node.id==="lock" && node.kind==="file" ? {...node,content:"tampered"} : node)};
    expect(invalidateManagedDependenciesOnManifestEdit(ws(packageV1),modified)).toBe(modified);
  });
});
