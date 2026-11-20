import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { buildZoeCapabilityEvidence } from "./zoeCapabilityEvidence";
import { generateTanstackAgentProposal } from "./zoeTanstackAgentProposal";

function fixture(files: Record<string,string>): WorkspaceStateV2 {
  const nodes: Record<string,unknown>[] = [];
  const folders = new Map<string,string>();
  for (const [path,content] of Object.entries(files)) {
    const bits=path.split("/");let parentId:string|null=null;
    for (let i=0;i<bits.length-1;i++) {
      const key=bits.slice(0,i+1).join("/");
      if (!folders.has(key)) { const id=`folder:${key}`;folders.set(key,id);
        nodes.push({id,kind:"folder",name:bits[i],parentId,createdAt:1,updatedAt:1}); }
      parentId=folders.get(key)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:bits.at(-1),parentId,content,createdAt:1,updatedAt:1});
  }
  const activeFileId="file:src/routes/index.tsx";
  return {version:2,language:"web",nodes,activeFileId,entryFileId:activeFileId,
    openTabs:[activeFileId],expanded:["folder:src"],stdin:"",leftPct:25} as unknown as WorkspaceStateV2;
}
const page=(url:string,s:string)=>`import {createFileRoute} from '@tanstack/react-router'; export const Route = createFileRoute('${url}')({component:()=> <main>${s}</main>});`;
const workspace=()=>fixture({
  "src/router.tsx":"export const router = {}",
  "src/routes/__root.tsx":"export const Route = {}",
  "src/routes/index.tsx":page("/","Home"),
  "src/components/Header.tsx":"export const Header = () => <header>Old</header>",
  "src/server/checkout.server.ts":"export const secret = 'sensitive'",
});
const project={title:"Test",stackId:"tanstack-start-v1",sourceVersion:8,activePath:"src/routes/index.tsx"};
function action(edits:unknown[],summary="Updated home") {
  return JSON.stringify({kind:"propose",path:"",query:"",prefix:"",offset:0,limit:0,
    summary,edits,patches:[],reads:[]});
}

describe("P3B7E4B2E TanStack metered proposal handoff",()=>{
  it("proposes only server-inspected source with server-derived hashes and no save",async()=>{
    let calls=0;
    const w=workspace();
    const original=(w.nodes.find(n=>n.kind==="file" && n.name==="index.tsx") as {content:string}).content;
    const result=await generateTanstackAgentProposal({workspace:w,project,userRequest:"Update home",
      requestedPage:"/",conversation:[],system:"Safe TanStack edits only",generate:async()=>{
        calls++;
        return {text:action([{path:"src/routes/index.tsx",content:page("/","New"),create:false,
          beforeSha256:"a".repeat(64),buildVerification:{state:"passed"}}])};
      }});
    expect(calls).toBe(1);
    expect(result.kind).toBe("proposal");
    if(result.kind!=="proposal") return;
    expect(result.proposal.baseVersion).toBe(8);
    expect(result.proposal.edits).toHaveLength(1);
    expect(result.proposal.edits[0]?.beforeSha256).not.toBe("a".repeat(64));
    expect(result.proposal.buildVerification).toBeUndefined();
    expect((w.nodes.find(n=>n.kind==="file" && n.name==="index.tsx") as {content:string}).content).toBe(original);
  });
  it("passes server-derived capability evidence into the agent model request",async()=>{
    const capabilityEvidence=buildZoeCapabilityEvidence({
      project:{stackId:project.stackId,status:"draft",sourceVersion:project.sourceVersion},
      publishEnabled:true,aiEditAllowed:true,commerceLookup:"failed",commerceStorePresent:false,
      connections:[],routes:[],runtimeProviders:[],
    });
    let calls=0;
    const result=await generateTanstackAgentProposal({workspace:workspace(),project,
      userRequest:"Can you publish?",conversation:[],requestedPage:null,system:"Safe",
      capabilityEvidence,generate:async(request)=>{
        calls++;
        expect(JSON.parse(request.user).capabilityEvidence).toEqual(capabilityEvidence);
        return{text:action([],"Worker publishing is not available")};
      }});
    expect(calls).toBe(1);
    expect(result.kind).toBe("clarification");
  });
  it("preflights private pages and wrong stack without a paid model call",async()=>{
    let calls=0;
    const input={workspace:workspace(),project,userRequest:"Edit",conversation:[] as string[],
      system:"Safe",generate:async()=>{calls++;return{text:action([])}}};
    await expect(generateTanstackAgentProposal({...input,requestedPage:"/api/payments"})).rejects.toThrow();
    await expect(generateTanstackAgentProposal({...input,requestedPage:"/$id"})).rejects.toThrow();
    await expect(generateTanstackAgentProposal({...input,requestedPage:null,
      project:{...project,stackId:"react-vite-v1"}})).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it("rejects edits to non-inspected files and protected server code",async()=>{
    const input={workspace:workspace(),project,userRequest:"Edit",conversation:[] as string[],
      system:"Safe",requestedPage:null};
    await expect(generateTanstackAgentProposal({...input,generate:async()=>({text:action([
      {path:"src/server/checkout.server.ts",content:"changed",create:false}])})})).rejects.toThrow();
  });
  it("produces a non-mutating clarification for a finished no-edit agent call",async()=>{
    const result=await generateTanstackAgentProposal({workspace:workspace(),project,userRequest:"Maybe",
      conversation:[],requestedPage:null,system:"Safe",
      generate:async()=>({text:action([],"Which section should I update?")})});
    expect(result).toMatchObject({kind:"clarification",clarification:"Which section should I update?"});
  });
  it("requires an actual valid edit to the requested route",async()=>{
    await expect(generateTanstackAgentProposal({workspace:workspace(),project,userRequest:"Add Contact",
      conversation:[],requestedPage:"/contact",system:"Safe",
      generate:async()=>({text:action([{path:"src/routes/index.tsx",content:page("/","Changed"),create:false}])})})).rejects.toThrow();
  });
});


describe("AI3B authoritative candidate correction",()=>{
  it("lets the agent correct a rejected source proposal using the same metered step loop",async()=>{
    const w=workspace();const before=JSON.stringify(w);let calls=0;
    const result=await generateTanstackAgentProposal({workspace:w,project,userRequest:"Create an interactive game",
      conversation:[],requestedPage:null,system:"Implement the requested behavior",generate:async request=>{
        calls++;
        if(calls===1)return {text:action([{path:"src/server/game.ts",content:"export const score=0",create:true}])};
        expect(JSON.parse(request.user).observations.at(-1).response).toMatchObject({reason:"CANDIDATE_VALIDATION_FAILED",code:"BUILD_TANSTACK_SOURCE_UNSAFE"});
        expect(JSON.parse(request.user).stagedPaths).toEqual([]);
        return {text:action([{path:"src/lib/game.ts",content:"export const increase=(score:number)=>score+1;",create:true},
          {path:"src/routes/index.tsx",content:page("/","Play"),create:false}],"Game logic")};
      }});
    expect(calls).toBe(2);
    expect(result.kind).toBe("proposal");
    if(result.kind!=="proposal")return;
    expect(result.proposal.edits.map(e=>e.path)).toEqual(["src/lib/game.ts","src/routes/index.tsx"]);
    expect(result.proposal.buildVerification).toBeUndefined();
    expect(JSON.stringify(w)).toBe(before);
  });
});
