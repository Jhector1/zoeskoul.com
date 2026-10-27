import {describe, expect, it} from "vitest";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {runZoeProjectAgent, ZoeProjectAgentError} from "./zoeProjectAgentLoop";

function workspace(files: Record<string,string>): WorkspaceStateV2 {
  const nodes: Record<string,unknown>[] = [];
  const dirs = new Map<string,string>();
  for (const [path,content] of Object.entries(files)) {
    const parts = path.split("/");
    let parentId: string|null = null;
    for (let i=0;i<parts.length-1;i++) {
      const name=parts.slice(0,i+1).join("/");
      if (!dirs.has(name)) {
        const id=`dir:${name}`;
        nodes.push({id,kind:"folder",name:parts[i],parentId,createdAt:1,updatedAt:1});
        dirs.set(name,id);
      }
      parentId=dirs.get(name)!;
    }
    nodes.push({id:`file:${path}`,kind:"file",name:parts.at(-1),parentId,
      content,createdAt:1,updatedAt:1});
  }
  return {version:2,language:"web",nodes,openTabs:[],activeFileId:null,entryFileId:null,
    stdin:"",expanded:[],leftPct:25} as unknown as WorkspaceStateV2;
}

function action(kind:string, props:Record<string,unknown>={}) {
  return JSON.stringify({kind,path:"",query:"",prefix:"",offset:0,limit:24000,
    summary:"",edits:[],patches:[],...props});
}
async function run(files:Record<string,string>, responses:string[]) {
  const prompts:string[]=[];
  const result=await runZoeProjectAgent({workspace:workspace(files),
    userRequest:"Consolidate layouts",conversation:[],system:"Preserve routes",
    project:{title:"Forma",stackId:"react-vite-v1",sourceVersion:12,activePath:null},
    maxSteps:responses.length,
    generate:async(request,index)=>{prompts.push(request.user);return {text:responses[index]!};},
  });
  return {result,prompts};
}

describe("V12K10G paid agent step staging and exact patches",()=>{
  it("stages a new shared component and patches large pages without reprinting full sources",async()=>{
    const large="X".repeat(26000);
    const app=`<header>old brand</header>${large}<footer>old footer</footer>`;
    const flow=[
      action("list"),
      action("read",{path:"src/App.tsx"}),
      action("read",{path:"src/App.tsx",offset:24000,limit:24000}),
      action("stage",{edits:[{path:"src/components/SiteHeader.tsx",create:true,content:"export default function SiteHeader(){return <header>brand</header>}"}]}),
      action("patch",{patches:[
        {path:"src/App.tsx",before:"<header>old brand</header>",after:"<SiteHeader />"},
        {path:"src/App.tsx",before:"<footer>old footer</footer>",after:"<SiteFooter />"},
      ]}),
      action("propose",{summary:"Shared layout without changing page content"}),
    ];
    const {result,prompts}=await run({"src/App.tsx":app},flow);
    const edits=JSON.parse(result.text).edits as Array<{path:string;content:string;create:boolean}>;
    expect(edits).toHaveLength(2);
    expect(edits.find(e=>e.path==="src/App.tsx")?.content)
      .toBe(`<SiteHeader />${large}<SiteFooter />`);
    expect(edits.find(e=>e.path==="src/components/SiteHeader.tsx")?.create).toBe(true);
    expect(result.fullyReadPaths).toContain("src/App.tsx");
    expect(prompts[5]).not.toContain(large);
  });

  it("rejects editing files before complete read without staging partial writes",async()=>{
    const source="A".repeat(26000);
    const {result,prompts}=await run({"src/App.tsx":source},[
      action("read",{path:"src/App.tsx"}),
      action("patch",{patches:[{path:"src/App.tsx",before:"AAAA",after:"changed"}]}),
      action("propose",{summary:"No complete source edit"}),
    ]);
    expect(JSON.parse(result.text).edits).toEqual([]);
    expect(prompts[2]).toContain("EXISTING_SOURCE_NOT_FULLY_READ");
  });

  it("does not partially stage a multi-patch action with an ambiguous anchor",async()=>{
    const source="HEADER middle HEADER";
    const {result,prompts}=await run({"src/App.tsx":source},[
      action("read",{path:"src/App.tsx"}),
      action("patch",{patches:[
        {path:"src/App.tsx",before:"middle",after:"updated"},
        {path:"src/App.tsx",before:"HEADER",after:"NEW"},
      ]}),
      action("propose",{summary:"Cannot safely patch ambiguous source"}),
    ]);
    expect(JSON.parse(result.text).edits).toEqual([]);
    expect(prompts[2]).toContain("PATCH_ANCHOR_AMBIGUOUS");
  });

  it("consolidates repeated patches to one staged file without changing the saved snapshot",async()=>{
    const source="<header>A</header><footer>B</footer>";
    const ws=workspace({"src/App.tsx":source});
    const responses=[action("read",{path:"src/App.tsx"}),
      action("patch",{patches:[{path:"src/App.tsx",before:"<header>A</header>",after:"<Header/>"}]}),
      action("patch",{patches:[{path:"src/App.tsx",before:"<footer>B</footer>",after:"<Footer/>"}]}),
      action("propose",{summary:"Done"})];
    const result=await runZoeProjectAgent({workspace:ws,userRequest:"DRY",conversation:[],system:"DRY",
      project:{title:"Forma",stackId:"react-vite-v1",sourceVersion:12,activePath:null},maxSteps:4,
      generate:async(_r,i)=>({text:responses[i]!})});
    expect(JSON.parse(result.text).edits).toEqual([
      {path:"src/App.tsx",create:false,content:"<Header/><Footer/>"},
    ]);
    expect(ws.nodes.some(n=>n.kind==="file" && n.content===source)).toBe(true);
  });

  it("rejects malformed provider JSON without a hidden paid retry",async()=>{
    let count=0;
    await expect(runZoeProjectAgent({workspace:workspace({"src/App.tsx":"source"}),
      userRequest:"DRY",conversation:[],system:"DRY",maxSteps:4,
      project:{title:"Forma",stackId:"react-vite-v1",sourceVersion:12,activePath:null},
      generate:async()=>{count++;return {text:'{"kind":"list"'};},
    })).rejects.toMatchObject({name:"ZoeProjectAgentError",code:"AGENT_INVALID_RESPONSE"});
    expect(count).toBe(1);
  });
});
