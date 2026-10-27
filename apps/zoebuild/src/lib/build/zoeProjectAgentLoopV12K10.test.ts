import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { runZoeProjectAgent, ZoeProjectAgentError } from "./zoeProjectAgentLoop";
import { createZoeProjectFileTools } from "./zoeProjectFileTools";

function workspace(files: Record<string,string>): WorkspaceStateV2 {
  const nodes: Record<string, unknown>[] = [];
  const folders = new Map<string,string>();
  for (const [path,content] of Object.entries(files)) {
    const parts = path.split("/");
    let parentId: string|null=null;
    for(let i=0;i<parts.length-1;i++) {
      const p=parts.slice(0,i+1).join("/");
      if(!folders.has(p)) {
        const id=`dir:${p}`;
        nodes.push({id,kind:"folder",name:parts[i],parentId,createdAt:1,updatedAt:1});
        folders.set(p,id);
      }
      parentId=folders.get(p)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:parts.at(-1),parentId,content,createdAt:1,updatedAt:1});
  }
  return {version:2,language:"web",nodes,openTabs:[],activeFileId:null,entryFileId:null,
    stdin:"",expanded:[],leftPct:25} as unknown as WorkspaceStateV2;
}
const call = (kind:string, data:Record<string,unknown>={}) => JSON.stringify({
  kind,path:"",query:"",prefix:"",offset:0,limit:20,summary:"",edits:[],...data,
});
function agent(ws:WorkspaceStateV2, steps:string[]) {
  const requests:string[]=[];
  return {requests, promise:runZoeProjectAgent({
    workspace:ws,userRequest:"Extract shared navigation",conversation:[],
    project:{title:"Forma",stackId:"react-vite-v1",sourceVersion:12,activePath:"src/App.tsx"},
    system:"Preserve design",maxSteps:steps.length,
    generate:async (request,step) => {
      requests.push(request.user);
      expect(step).toBe(requests.length-1);
      return {text:steps[step]!,metadata:{reasoningSummary:"Selected effort unchanged"}};
    },
  })};
}

describe("V12K10 project-wide tool-directed source inspection",()=>{
  it("resolves 260 source files, including every page beyond the earlier cutoff",()=>{
    const ws=workspace(Object.fromEntries(Array.from({length:260},(_,i)=>[
      `src/pages/page${String(i).padStart(3,"0")}.tsx`, `export default function Page(){return <main>${i}</main>}`])));
    const tools=createZoeProjectFileTools(ws);
    const first=tools.list({limit:100});
    const second=tools.list({limit:100,offset:first.nextOffset!});
    const last=tools.list({limit:100,offset:second.nextOffset!});
    expect([...first.entries,...second.entries,...last.entries]).toHaveLength(260);
    expect(last.nextOffset).toBeNull();
  });
  it("lets Zoé inspect the project, read original content and propose a shared component",async()=>{
    const source='export default function App(){return <header>FORMA</header>}';
    const ws=workspace({"src/App.tsx":source,"src/pages/contact.tsx":"export default function Contact(){return <main>contact</main>} "});
    const changes=[{path:"src/App.tsx",content:"import SiteHeader from './components/SiteHeader'; export default function App(){return <SiteHeader/>}",create:false},
      {path:"src/components/SiteHeader.tsx",content:"export default function SiteHeader(){return <header>FORMA</header>}",create:true}];
    const flow=agent(ws,[call("list",{limit:40}),call("read",{path:"src/App.tsx",limit:24000}),
      call("propose",{summary:"Consolidated shared header",edits:changes})]);
    const result=await flow.promise;
    expect(result.steps).toBe(3);
    expect(result.fullyReadPaths).toContain("src/App.tsx");
    expect(JSON.parse(result.text).edits).toEqual(changes);
    expect(flow.requests[1]).toContain("src/App.tsx");
    expect(flow.requests[2]).toContain(source);
    expect(ws.nodes.some(n=>n.kind==="file" && n.name==="SiteHeader.tsx")).toBe(false);
  });
  it("refuses an edit until the entire existing source has been inspected",async()=>{
    const content="A".repeat(25_000);
    const edits=[{path:"src/App.tsx",content:"fully revised",create:false}];
    const flow=agent(workspace({"src/App.tsx":content}),[
      call("read",{path:"src/App.tsx",limit:24000}),
      call("propose",{edits,summary:"premature"}),
      call("read",{path:"src/App.tsx",offset:24000,limit:1000}),
      call("propose",{edits,summary:"complete"}),
    ]);
    const result=await flow.promise;
    expect(result.steps).toBe(4);
    expect(result.fullyReadPaths).toContain("src/App.tsx");
    expect(flow.requests[2]).toContain("EXISTING_SOURCE_NOT_FULLY_READ");
  });
  it("fails closed at the execution limit; never saves or invents file contents",async()=>{
    const flow=agent(workspace({"src/App.tsx":"source"}),[
      call("list",{limit:10}),call("list",{limit:10}),
    ]);
    await expect(flow.promise).rejects.toMatchObject({code:"AGENT_INSPECTION_INCOMPLETE"});
    expect(flow.requests).toHaveLength(2);
  });
  it("rejects credential file access without exposing its contents",async()=>{
    const fakeKey=["sk", "live", "abcdefghijklmnopqrstuvwxyz"].join("_");
    const flow=agent(workspace({"src/App.tsx":"app","src/secret.tsx":fakeKey}),[
      call("read",{path:"src/secret.tsx",limit:100}),
      call("propose",{edits:[],summary:"Cannot inspect protected source"}),
    ]);
    const result=await flow.promise;
    expect(result.text).toContain("Cannot inspect protected source");
    expect(flow.requests[1]).toContain("INVALID_PATH");
    expect(flow.requests[1]).not.toContain(fakeKey);
  });
});
