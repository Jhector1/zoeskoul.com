import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { isTanstackEditableSource, isTanstackSourceWorkspace, tanstackPageUrl } from "./zoeTanstackSourcePolicy";
import { applyZoeEditsToWorkspace, listZoeEditableFiles, sha256, validateZoeEdits } from "./zoeTargetedSourceEdit";

function workspace(sources: Record<string,string>): WorkspaceStateV2 {
  const nodes: Record<string, unknown>[] = [];
  const folders = new Map<string,string>();
  for (const [path,content] of Object.entries(sources)) {
    const segments = path.split("/"); let parentId: string | null = null;
    for (let n=0; n<segments.length-1;n++) {
      const folder = segments.slice(0,n+1).join("/");
      if (!folders.has(folder)) {
        const id = `folder:${folder}`;folders.set(folder,id);
        nodes.push({id,kind:"folder",name:segments[n],parentId,createdAt:1,updatedAt:1});
      }
      parentId=folders.get(folder)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:segments.at(-1),parentId,content,createdAt:1,updatedAt:1});
  }
  const activeFileId="file:src/routes/index.tsx";
  return {version:2,language:"web",nodes,openTabs:[activeFileId],activeFileId,
    entryFileId:activeFileId,stdin:"",expanded:["folder:src"],leftPct:25} as unknown as WorkspaceStateV2;
}
const page = (url:string,text:string) => `import { createFileRoute } from '@tanstack/react-router';\nexport const Route=createFileRoute('${url}')({ component: () => <div>${text}</div> });`;
const base=()=>workspace({
  "src/router.tsx":"export const router = {};",
  "src/routes/__root.tsx":"export const Route = {};",
  "src/routes/index.tsx":page("/","Home"),
  "src/routes/about.tsx":page("/about","About"),
  "src/routes/api.health.ts":"export const Route=createFileRoute('/api/health')({server: {handlers:{}}})",
  "src/functions/siteInfo.functions.ts":"export const getSiteInfo=()=>{}",
  "src/server/siteInfo.server.ts":"const secret='never'",
  "src/data/site.ts":"export const site={name:'Store'}",
  "src/styles.css":"body {color:red}",
});
const edit=(path:string,before:string,content:string,create=false)=>({path,content,
  beforeSha256:sha256(create?"":before),...(create?{create:true as const}:{})});
function sourceMap(ws:WorkspaceStateV2):Map<string,string> {
  return new Map(ws.nodes.flatMap(n=>n.kind==="file"&&!n.binary?[[pathOf(ws.nodes,n.id),n.content] as const]:[]));
}

describe("P3B7E4A TanStack Start target edit boundary",()=>{
  it("identifies canonical TanStack source without confusing React/Vite",()=>{
    expect(isTanstackSourceWorkspace(new Set(sourceMap(base()).keys()))).toBe(true);
    expect(isTanstackSourceWorkspace(new Set(["src/App.tsx","src/main.tsx"]))).toBe(false);
    expect(tanstackPageUrl("src/routes/blog.index.tsx")).toBe("/blog");
    expect(tanstackPageUrl("src/routes/api.health.tsx")).toBe(null);
  });
  it("only exposes public page components, styles, and presentational data",()=>{
    const list=listZoeEditableFiles(base(),"src/routes/index.tsx").map(f=>f.path);
    expect(list).toEqual(expect.arrayContaining(["src/routes/index.tsx","src/routes/about.tsx","src/data/site.ts","src/styles.css"]));
    for(const forbidden of ["src/router.tsx","src/routes/__root.tsx","src/routes/api.health.ts",
      "src/functions/siteInfo.functions.ts","src/server/siteInfo.server.ts"])
      expect(list).not.toContain(forbidden);
  });
  it("applies a reviewed existing route change with hashes and preserves backend",()=>{
    const ws=base();const old=sourceMap(ws).get("src/routes/about.tsx")!;
    const change=edit("src/routes/about.tsx",old,page("/about","Revised"));
    const next=applyZoeEditsToWorkspace(ws,[change]);
    expect(sourceMap(next).get("src/routes/about.tsx")).toContain("Revised");
    expect(sourceMap(next).get("src/routes/api.health.ts")).toBe(sourceMap(ws).get("src/routes/api.health.ts"));
    expect(sourceMap(ws).get("src/routes/about.tsx")).toBe(old);
    expect(()=>validateZoeEdits(ws,[{...change,beforeSha256:sha256("stale")}])).toThrow();
  });
  it("creates a file-based page plus a shared component atomically",()=>{
    const ws=base(); const changes=[
      edit("src/routes/contact.tsx","",page("/contact","Contact"),true),
      edit("src/components/shared/ContactCard.tsx","","export function ContactCard(){return <div>Contact</div>}",true),
    ];
    const next=applyZoeEditsToWorkspace(ws,changes);
    expect(sourceMap(next).get("src/routes/contact.tsx")).toContain("/contact");
    expect(sourceMap(next).get("src/components/shared/ContactCard.tsx")).toContain("ContactCard");
    expect(next.nodes.length).toBeGreaterThan(ws.nodes.length);
  });
  it("rejects privileged paths, route mismatches, and API masquerading",()=>{
    const ws=base();
    const forbidden=["src/routes/api.checkout.tsx","src/routes/private.server.tsx",
      "src/routes/$user.tsx","src/routes/__root.tsx","src/router.tsx",
      "src/functions/payments.functions.ts","src/server/payment.server.ts",
      "src/components/../../secrets.tsx","src/components/.env.tsx","src/components/config/auth.tsx"];
    for (const path of forbidden) expect(()=>validateZoeEdits(ws,[edit(path,"",page("/contact","Nope"),true)])).toThrow();
    expect(()=>validateZoeEdits(ws,[edit("src/routes/contact.tsx","",page("/different","Wrong"),true)])).toThrow();
    expect(()=>validateZoeEdits(ws,[edit("src/routes/contact.tsx","",
      `export const Route=createFileRoute('/contact')({server:{handlers:{GET(){}}},component:()=>null})`,true)])).toThrow();
    expect(isTanstackEditableSource("src/data/db.server.ts","export const db=1")).toBe(false);
  });
  it("rejects duplicates, invalid structured data, and existing-path overwrite",()=>{
    const ws=base();const e=edit("src/data/new.json","",'{"ok":true}',true);
    expect(()=>validateZoeEdits(ws,[e,e])).toThrow();
    expect(()=>validateZoeEdits(ws,[{...e,content:"not json"}])).toThrow();
    expect(()=>validateZoeEdits(ws,[{...e,path:"src/data/site.ts"}])).toThrow();
    expect(sourceMap(applyZoeEditsToWorkspace(ws,[e])).get("src/data/new.json")).toBe('{"ok":true}');
  });
});
