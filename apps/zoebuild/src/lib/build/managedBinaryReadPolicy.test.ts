import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import type {ManagedBinaryAtomicSourcePort} from "./managedBinaryCommit";
import {managedBinaryReadsEnabled,resolveOwnedBuildWorkspace} from "./managedBinaryReadPolicy";

const scope={ownerId:"user_12345678",buildProjectId:"project_12345678"};
const workspace: WorkspaceStateV2={
  version:2,language:"web",leftPct:30,entryFileId:"file_01",activeFileId:"file_01",
  openTabs:["file_01"],expanded:[],stdin:"",
  nodes:[{id:"file_01",kind:"file" as const,name:"index.tsx",parentId:null,
    content:"export default function Home(){return null;}",
    createdAt:1_700_000_000_000,updatedAt:1_700_000_000_000}],
};
function port(read:ManagedBinaryAtomicSourcePort<WorkspaceStateV2>["readOwnedRevision"]):ManagedBinaryAtomicSourcePort<WorkspaceStateV2>{
  return {commitOwnedRevision:async()=>{throw Error("WRITE_FORBIDDEN");},readOwnedRevision:read};
}
function call(enabled:boolean,p:ManagedBinaryAtomicSourcePort<WorkspaceStateV2>,readObject=async (_:string)=>null){
  return resolveOwnedBuildWorkspace({enabled,scope,sourceVersion:8,
    legacyWorkspace:workspace,port:p,readObject});
}
describe("AI4B4E2F opt-in canonical reads",()=>{
  it("requires explicit 1; all other flag values remain off",()=>{
    for(const v of [undefined,"", "0","true","yes","on","1 "])
      expect(managedBinaryReadsEnabled(v)).toBe(false);
    expect(managedBinaryReadsEnabled("1")).toBe(true);
  });
  it("leaves legacy reads fully offline with zero DB and R2 calls",async()=>{
    let requests=0;
    const output=await call(false,port(async()=>{requests++;throw Error("DB_CALLED");}),
      async()=>{requests++;throw Error("R2_CALLED");});
    expect(output).toEqual(workspace);
    expect(requests).toBe(0);
  });
  it("validates and returns owner-scoped legacy history when gate enabled",async()=>{
    let reads=0;
    const output=await call(true,port(async()=>({kind:"legacy",workspace})),
      async()=>{reads++;return null;});
    expect(output).toEqual(workspace);
    expect(reads).toBe(0);
  });
  it("accepts a matching immutable R2 revision with no asset bindings",async()=>{
    const output=await call(true,port(async()=>({kind:"managed",
      revision:{...scope,sourceVersion:8,bindings:[]},
      snapshot:{format:"zoebuild-r2-binary-snapshot-v1",sourceVersion:8,workspace},
    })),async()=>{throw Error("UNEXPECTED_R2_READ");});
    expect(output).toEqual(workspace);
  });
  it("fails closed on a mismatching owner or missing revision",async()=>{
    await expect(call(true,port(async()=>({kind:"managed",
      revision:{...scope,ownerId:"other_123456",sourceVersion:8,bindings:[]},
      snapshot:{format:"zoebuild-r2-binary-snapshot-v1",sourceVersion:8,workspace},
    })))).rejects.toThrow("MANAGED_BINARY_REVISION_MISMATCH");
    await expect(call(true,port(async()=>null))).rejects.toThrow("MANAGED_READ_REVISION_NOT_FOUND");
  });
  it("refuses malformed canonical workspaces even from an owned storage port",async()=>{
    const bad={...workspace,nodes:[]};
    await expect(call(true,port(async()=>({kind:"legacy",workspace:bad})))).rejects.toThrow();
  });
  it("continues rejecting invalid node timestamps in both read modes",async()=>{
    for(const field of ["createdAt","updatedAt"] as const){
      const bad={...workspace,nodes:workspace.nodes.map(node=>({...node,[field]:Number.NaN}))};
      await expect(resolveOwnedBuildWorkspace({enabled:false,scope,sourceVersion:8,
        legacyWorkspace:bad,port:port(async()=>{throw Error("DB_CALLED");}),
        readObject:async()=>{throw Error("R2_CALLED");}})).rejects.toThrow(`invalid ${field}`);
      await expect(call(true,port(async()=>({kind:"legacy",workspace:bad})))).rejects.toThrow(`invalid ${field}`);
    }
  });
  it("uses the single hydrated project loader for previews and owner-scoped history reads",()=>{
    const dir=join(import.meta.dirname,"../../");
    const preview=readFileSync(join(import.meta.dirname,"reactPreviewServer.ts"),"utf8");
    const history=readFileSync(join(dir,"app/api/build/projects/[buildProjectId]/source-history/route.ts"),"utf8");
    const adapter=readFileSync(join(import.meta.dirname,"prismaManagedBinaryRead.ts"),"utf8");
    const loader=readFileSync(join(import.meta.dirname,"readBuildProjects.ts"),"utf8");
    expect(loader).toContain('process.env.ZOEBUILD_MANAGED_R2_READS === "1"');
    expect(loader).toContain("readCanonicalOwnedBuildWorkspace({");
    expect(preview).not.toContain("readCanonicalOwnedBuildWorkspace(");
    expect(preview.match(/parseBuildWorkspaceMutation\(project.workspace\)/g)).toHaveLength(2);
    expect(history.match(/readCanonicalOwnedBuildWorkspace\(/g)).toHaveLength(2);
    expect(history).toContain("BUILD_HISTORY_MANAGED_RESTORE_UNAVAILABLE");
    expect(history).toContain("hasManagedBinaryRevisionMarker(head?.meta)");
    expect(history).toContain("hasManagedBinaryRevisionMarker(revisionMetadata?.meta)");
    expect(history).toContain("if (managed) return \"protected\" as const;");
    expect(adapter).toContain("createPrismaManagedBinaryPort(input.client)");
    expect(adapter).toContain("createZoeBuildPrivateR2ObjectStore().read(key)");
    expect(adapter).toContain("ZOEBUILD_MANAGED_R2_READS");
  });
});
