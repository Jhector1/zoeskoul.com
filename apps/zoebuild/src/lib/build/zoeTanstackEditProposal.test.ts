import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { prepareTanstackReviewedEdit, resolveTanstackRequestedPage, zoeTanstackEditRuntimeGate } from "./zoeTanstackEditProposal";

function fixture(files: Record<string,string>): WorkspaceStateV2 {
  const nodes: Record<string,unknown>[] = [];
  const folders = new Map<string,string>();
  for (const [path,content] of Object.entries(files)) {
    const bits=path.split("/");let parentId:string|null=null;
    for (let i=0;i<bits.length-1;i++) {
      const k=bits.slice(0,i+1).join("/");
      if (!folders.has(k)) { const id=`folder:${k}`;folders.set(k,id);
        nodes.push({id,kind:"folder",name:bits[i],parentId,createdAt:1,updatedAt:1}); }
      parentId=folders.get(k)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:bits.at(-1),parentId,content,createdAt:1,updatedAt:1});
  }
  const activeFileId="file:src/routes/index.tsx";
  return {version:2,language:"web",nodes,activeFileId,entryFileId:activeFileId,
    openTabs:[activeFileId],expanded:["folder:src"],stdin:"",leftPct:25} as unknown as WorkspaceStateV2;
}
const page=(url:string,s:string)=>`import {createFileRoute} from '@tanstack/react-router'; export const Route = createFileRoute('${url}')({component:()=> <main>${s}</main>});`;
const files=()=>({
  "src/router.tsx":"export const router = {}",
  "src/routes/__root.tsx":"export const Route = {}",
  "src/routes/index.tsx":page("/","Home"),
  "src/routes/blog/index.tsx":page("/blog","Blog"),
  "src/routes/api.orders.ts":"server handler",
  "src/server/checkout.server.ts":"secret service",
  "src/components/Header.tsx":"export function Header(){return <header/>}",
});
const ws=()=>fixture(files());
const editable=(path:string,content:string)=>({path,content,create:false});

describe("P3B7E4B1 trusted TanStack edit review assembly",()=>{
  it("resolves existing file routes and safe newly requested pages",()=>{
    expect(resolveTanstackRequestedPage(ws(),"/")).toEqual({path:"src/routes/index.tsx",url:"/",exists:true});
    expect(resolveTanstackRequestedPage(ws(),"/blog")).toEqual({path:"src/routes/blog/index.tsx",url:"/blog",exists:true});
    expect(resolveTanstackRequestedPage(ws(),"/contact")).toEqual({path:"src/routes/contact.tsx",url:"/contact",exists:false});
    expect(resolveTanstackRequestedPage(ws(),"/docs/getting-started")).toEqual({path:"src/routes/docs/getting-started.tsx",url:"/docs/getting-started",exists:false});
    for (const route of ["/api/orders","/server","/auth","/$id","/BLOG","/blog?x=1","/blog//foo","/blog/../admin", "//evil"])
      expect(()=>resolveTanstackRequestedPage(ws(),route)).toThrow();
  });
  it("prepares a reviewed existing page with server-owned hashes, leaving source unchanged",()=>{
    const original=ws();const before=original.nodes.find(n=>n.kind==="file" && n.name==="index.tsx")!;
    const proposal=prepareTanstackReviewedEdit({workspace:original,baseVersion:8,summary:"Update home",
      requestedPage:"/",fullyInspectedPaths:["src/routes/index.tsx"],
      drafts:[editable("src/routes/index.tsx",page("/","Updated"))]});
    expect(proposal.baseVersion).toBe(8);
    expect(proposal.edits).toHaveLength(1);
    expect(proposal.edits[0]?.beforeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(proposal.edits[0]?.afterPreview).toContain("Updated");
    expect((before as {content:string}).content).toContain("Home");
    expect(proposal.summary).toContain("Worker build verification is required");
  });
  it("can propose a new static route and reusable component atomically",()=>{
    const proposal=prepareTanstackReviewedEdit({workspace:ws(),baseVersion:3,summary:"Add contact",
      requestedPage:"/contact",fullyInspectedPaths:["src/routes/index.tsx"],drafts:[
        {path:"src/routes/contact.tsx",content:page("/contact","Contact"),create:true},
        {path:"src/components/ContactCard.tsx",content:"export const ContactCard=()=> <aside>Contact</aside>",create:true},
      ]});
    expect(proposal.edits).toHaveLength(2);
    expect(proposal.edits.every(e=>e.create===true)).toBe(true);
  });
  it("rejects blind edits, misleading routes, unsafe files, and wrong requested pages",()=>{
    const input={workspace:ws(),baseVersion:3,summary:"Edit",fullyInspectedPaths:["src/routes/index.tsx"]};
    expect(()=>prepareTanstackReviewedEdit({...input,drafts:[editable("src/components/Header.tsx","changed")]})).toThrow();
    expect(()=>prepareTanstackReviewedEdit({...input,fullyInspectedPaths:[],drafts:[editable("src/routes/index.tsx",page("/","OK"))]})).toThrow();
    expect(()=>prepareTanstackReviewedEdit({...input,drafts:[{path:"src/server/private.ts",content:"bad",create:true}]})).toThrow();
    expect(()=>prepareTanstackReviewedEdit({...input,drafts:[{path:"src/routes/api.orders.tsx",content:page("/api/orders","Bad"),create:true}]})).toThrow();
    expect(()=>prepareTanstackReviewedEdit({...input,drafts:[{path:"src/routes/contact.tsx",content:page("/wrong","Oops"),create:true}]})).toThrow();
    expect(()=>prepareTanstackReviewedEdit({...input,requestedPage:"/contact",drafts:[editable("src/routes/index.tsx",page("/","OK"))]})).toThrow();
  });
  it("rejects retired stacks without suppressing the verified TanStack edit flow",()=>{
    expect(zoeTanstackEditRuntimeGate("tanstack-start-v1")).toBeNull();
    expect(zoeTanstackEditRuntimeGate("react-vite-v1")).toMatchObject({status:422,code:"BUILD_EDIT_STACK_UNSUPPORTED"});
    expect(zoeTanstackEditRuntimeGate(null)).toMatchObject({status:422,code:"BUILD_EDIT_STACK_UNSUPPORTED"});
  });
});
