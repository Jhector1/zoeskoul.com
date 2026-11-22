/** AI4B4E2G: actual application ports with real ephemeral PostgreSQL and
 * a simulated private R2 object store. Never run writes on an application DB. */
import {afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi} from "vitest";
import {createHash} from "node:crypto";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import type {BuildMediaPrivateObjectStore} from "@zoeskoul/build-application";
vi.mock("server-only",()=>({}));
// Stub only external identity/rate services. The actual HTTP handlers, origin
// checks, workspace parser, ownership checks, Prisma and transaction run here.
const httpActor = vi.hoisted(()=>({userId:null as string|null}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:async()=>({userId:httpActor.userId,entitlements:[]})}));
vi.mock("@zoeskoul/platform-server/security/ratelimit",()=>({rateLimit:async()=>({ok:true,resetMs:Date.now()+60_000})}));
// A managed restore must never call the legacy Runner verification branch.
vi.mock("@/lib/build/zoeReactIsolatedBuild",()=>({verifyZoeReactCandidateAtRunner:async()=>{throw Error("UNEXPECTED_LEGACY_RUNNER_CALL");}}));
// The project detail module also defines DELETE; unrelated deletion/Runner
// exports are deliberately forbidden in these read/save route tests.
vi.mock("@/lib/build/deleteOwnedBuildProject",()=>({deleteOwnedBuildProject:async()=>{throw Error("UNEXPECTED_PROJECT_DELETE");},preflightOwnedBuildProjectDeletion:async()=>{throw Error("UNEXPECTED_PROJECT_DELETE");},BuildProjectDeleteBlockedError:class extends Error{}}));
vi.mock("@/lib/server/runnerActorKey",()=>({requireRunnerActorKey:async()=>{throw Error("UNEXPECTED_RUNNER_AUTH");}}));
vi.mock("@/lib/build/reactPreviewRunnerClient",()=>({drainTrustedReactProjectPreviewsAtRunner:async()=>{throw Error("UNEXPECTED_RUNNER_DRAIN");},releaseTrustedReactProjectPreviewDrainAtRunner:async()=>{throw Error("UNEXPECTED_RUNNER_DRAIN");}}));
const mock = vi.hoisted(()=>({put:vi.fn<BuildMediaPrivateObjectStore["putIfAbsent"]>(),read:vi.fn<BuildMediaPrivateObjectStore["read"]>()}));
// No R2 credentials are read, even when the application writer's gate is active.
vi.mock("./cloudflareR2MediaServer",()=>({createZoeBuildPrivateR2ObjectStore:()=>({putIfAbsent:mock.put,read:mock.read})}));
const dbName = process.env.AI4B4E2E_TEST_DATABASE_NAME ?? "";
const enabled = /^zoebuild_ai4b4e2e_test_[a-f0-9]{12}$/.test(dbName) && process.env.AI4B4E2E_CONFIRM === "EPHEMERAL_ONLY";
const owner = "ai4b4e2g_owner_12345", other = "ai4b4e2g_other_12345", imageId = "ai4b4e2g_image_node";
const red = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";
const blue = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYPjPwMDAxMDAwMDAAAALHwEDmIWXfgAAAABJRU5ErkJggg==";
function workspace(data?:string, name="hero.png"):WorkspaceStateV2 {
  const nodes:WorkspaceStateV2["nodes"] = [
    {id:"ai4b4e2g_index_node",kind:"file",parentId:null,name:"index.tsx",content:"export default function Home(){return null;}",createdAt:1,updatedAt:1},
    {id:"ai4b4e2g_public",kind:"folder",parentId:null,name:"public",createdAt:1,updatedAt:1},
  ];
  if(data){const bytes=Buffer.from(data,"base64");nodes.push({id:imageId,kind:"file",name,parentId:"ai4b4e2g_public",content:"",createdAt:1,updatedAt:1,
    binary:{encoding:"base64",data,mimeType:"image/png",sizeBytes:bytes.length,checksum:`sha256:${createHash("sha256").update(bytes).digest("hex")}`}});}
  return {version:2,language:"web",leftPct:30,entryFileId:"ai4b4e2g_index_node",activeFileId:"ai4b4e2g_index_node",openTabs:["ai4b4e2g_index_node"],expanded:[],stdin:"",nodes};
}
type PrismaType=typeof import("@zoeskoul/platform-server/prisma")["prisma"];
let prisma:PrismaType;
let writer:typeof import("./saveBuildProjectSource")["createPrismaBuildProjectSourceWriter"];
let reader:typeof import("./readBuildProjects")["createPrismaBuildProjectReader"];
let saveCommand:typeof import("@zoeskoul/build-application")["saveBuildProjectSourceCommand"];
let getCommand:typeof import("@zoeskoul/build-application")["getBuildProjectCommand"];
let portFactory:typeof import("./prismaManagedBinaryPort")["createPrismaManagedBinaryPort"];
let historicalRead:typeof import("./prismaManagedBinaryRead")["readCanonicalOwnedBuildWorkspace"];
const objects=new Map<string,Uint8Array>();
async function fixture(suffix:string){
  const buildProjectId=`ai4b4e2g_build_${suffix}`, codeProjectId=`ai4b4e2g_code_${suffix}`;
  const initial=JSON.parse(JSON.stringify(workspace()));
  await prisma.codeProject.create({data:{id:codeProjectId,ownerId:owner,title:"Isolated native upload rehearsal",language:"web",workspace:initial,currentVersion:1,entryPath:"index.tsx",activePath:"index.tsx"}});
  await prisma.buildProject.create({data:{id:buildProjectId,codeProjectId}});
  await prisma.codeProjectRevision.create({data:{projectId:codeProjectId,version:1,snapshot:initial,createdById:owner}});
  vi.stubEnv("ZOEBUILD_MANAGED_R2_PILOT_PROJECT_ID",buildProjectId);
  return {buildProjectId,codeProjectId};
}
function save(id:string,baseVersion:number,ws:WorkspaceStateV2,userId=owner){
  return saveCommand({access:{userId,entitlements:[]},buildProjectId:id,baseVersion,workspace:ws,writer:writer(prisma)});
}
function get(id:string,userId=owner){return getCommand({access:{userId,entitlements:[]},buildProjectId:id,reader:reader(prisma)});}
function imageData(ws:WorkspaceStateV2|undefined){const node=ws?.nodes.find(x=>x.id===imageId);return node?.kind==="file"?node.binary?.data:undefined;}
async function head(id:string){return prisma.codeProject.findUniqueOrThrow({where:{id}});}

describe.skipIf(!enabled)("AI4B4E2G canonical application save and load rehearsal",()=>{
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL??"");
    const nonce=process.env.AI4B4E2E_TEST_NONCE??"";
    if(url.hostname!=="127.0.0.1"||url.port!=="55432"||decodeURIComponent(url.pathname.slice(1))!==dbName||!/^[a-f0-9]{32}$/.test(nonce))throw Error("REHEARSAL_UNSAFE_URL");
    ({prisma}=await import("@zoeskoul/platform-server/prisma"));
    const actual=await prisma.$queryRaw<Array<{database:string;standby:boolean}>>`SELECT current_database()::text AS database, pg_is_in_recovery() AS standby`;
    if(actual.length!==1||actual[0]?.database!==dbName||actual[0]?.standby!==false)throw Error("REHEARSAL_DATABASE_MISMATCH");
    const guard=await prisma.$queryRaw<Array<{nonce:string}>>`SELECT "nonce" FROM "__ai4b4e2e_guard" LIMIT 2`;
    if(guard.length!==1||guard[0]?.nonce!==nonce)throw Error("REHEARSAL_MARKER_MISMATCH");
    await prisma.$executeRaw`INSERT INTO "User"("id") VALUES (${owner}),(${other})`;
    ({createPrismaBuildProjectSourceWriter:writer}=await import("./saveBuildProjectSource"));
    ({createPrismaBuildProjectReader:reader}=await import("./readBuildProjects"));
    ({saveBuildProjectSourceCommand:saveCommand,getBuildProjectCommand:getCommand}=await import("@zoeskoul/build-application"));
    ({createPrismaManagedBinaryPort:portFactory}=await import("./prismaManagedBinaryPort"));
    ({readCanonicalOwnedBuildWorkspace:historicalRead}=await import("./prismaManagedBinaryRead"));
  },20000);
  afterAll(async()=>{if(prisma)await prisma.$disconnect();});
  beforeEach(()=>{
    vi.stubEnv("ZOEBUILD_MANAGED_R2_READS","1");vi.stubEnv("ZOEBUILD_MANAGED_R2_WRITES","1");
    objects.clear();mock.put.mockReset();mock.read.mockReset();
    mock.put.mockImplementation(async request=>{
      const intent=await prisma.buildManagedBinaryUploadIntent.findUnique({where:{objectKey:request.key}});
      // Real durable intent must be present BEFORE the simulated private PUT.
      expect(intent?.state).toBe("pending");expect(intent?.sha256).toBe(request.sha256);
      if(objects.has(request.key))return "already-exists";
      objects.set(request.key,Uint8Array.from(request.bytes));return "created";
    });
    mock.read.mockImplementation(async key=>objects.get(key)??null);
  });
  afterEach(()=>{httpActor.userId=null;vi.unstubAllEnvs();});
  it("general lane supports two ordinary private owners without a fixed project ID",async()=>{
    const f=await fixture("general_a"), g=await fixture("general_b");
    await prisma.buildProject.updateMany({where:{id:{in:[f.buildProjectId,g.buildProjectId]}},data:{stackId:"tanstack-start-v1"}});
    await prisma.codeProject.update({where:{id:g.codeProjectId},data:{ownerId:other}});
    vi.stubEnv("ZOEBUILD_MANAGED_R2_PILOT_PROJECT_ID","");
    vi.stubEnv("ZOEBUILD_MANAGED_R2_GENERAL_WRITES","1");
    await expect(save(f.buildProjectId,1,workspace(red),other)).resolves.toBeNull();
    expect(mock.put).not.toHaveBeenCalled();
    const a=await save(f.buildProjectId,1,workspace(red),owner);
    const b=await save(g.buildProjectId,1,workspace(blue),other);
    expect(a?.sourceVersion).toBe(2);expect(b?.sourceVersion).toBe(2);
    expect(imageData((await get(f.buildProjectId,owner))?.workspace)).toBe(red);
    expect(imageData((await get(g.buildProjectId,other))?.workspace)).toBe(blue);
    expect(await get(f.buildProjectId,other)).toBeNull();
    expect(mock.put).toHaveBeenCalledTimes(2);
    await save(f.buildProjectId,2,workspace(red,"renamed.png"),owner);
    expect(mock.put).toHaveBeenCalledTimes(2);
    vi.stubEnv("ZOEBUILD_MANAGED_R2_GENERAL_WRITES","0");
    await expect(save(f.buildProjectId,3,workspace(blue),owner)).rejects.toThrow("Managed project writes are disabled");
    expect((await head(f.codeProjectId)).currentVersion).toBe(3);
  },20000);
  it("uploads a decodable native PNG, atomically saves source and restores bytes through the central loader",async()=>{
    const f=await fixture("upload");
    const result=await save(f.buildProjectId,1,workspace(red));
    expect(result).toMatchObject({sourceVersion:2,changed:true});expect(mock.put).toHaveBeenCalledTimes(1);
    const row=await head(f.codeProjectId);expect(row.currentVersion).toBe(2);expect(JSON.stringify(row.workspace)).not.toContain(red);
    const history=await prisma.codeProjectRevision.findUniqueOrThrow({where:{projectId_version:{projectId:f.codeProjectId,version:2}}});
    expect(JSON.stringify(history.snapshot)).not.toContain(red);
    const manifest=await prisma.buildManagedBinaryRevision.findUniqueOrThrow({where:{buildProjectId_sourceVersion:{buildProjectId:f.buildProjectId,sourceVersion:2}}});
    expect(manifest.manifest).toMatchObject({ownerId:owner,bindings:[{path:"public/hero.png",nodeId:imageId}]});
    const loaded=await get(f.buildProjectId);expect(loaded?.sourceVersion).toBe(2);expect(imageData(loaded?.workspace)).toBe(red);
    expect(JSON.stringify(loaded)).not.toContain("project-media/");
    const intent=await prisma.buildManagedBinaryUploadIntent.findFirstOrThrow({where:{buildProjectId:f.buildProjectId}});expect(intent.state).toBe("committed");
    const noOp=await save(f.buildProjectId,2,loaded!.workspace);expect(noOp).toMatchObject({sourceVersion:2,changed:false});expect(mock.put).toHaveBeenCalledTimes(1);
  },20000);
  it("renames, replaces and deletes bindings while earlier revisions keep their original bytes",async()=>{
    const f=await fixture("lifecycle");await save(f.buildProjectId,1,workspace(red));
    await save(f.buildProjectId,2,workspace(red,"renamed.png"));expect(mock.put).toHaveBeenCalledTimes(1);
    await save(f.buildProjectId,3,workspace(blue,"renamed.png"));expect(mock.put).toHaveBeenCalledTimes(2);
    await save(f.buildProjectId,4,workspace());expect(imageData((await get(f.buildProjectId))?.workspace)).toBeUndefined();
    const old=await historicalRead({client:prisma,ownerId:owner,buildProjectId:f.buildProjectId,sourceVersion:2,legacyWorkspace:null});
    expect(imageData(old)).toBe(red);expect(old.nodes.find(x=>x.id===imageId)?.name).toBe("hero.png");
    const recent=await historicalRead({client:prisma,ownerId:owner,buildProjectId:f.buildProjectId,sourceVersion:4,legacyWorkspace:null});expect(imageData(recent)).toBe(blue);
    expect((await head(f.codeProjectId)).currentVersion).toBe(5);expect(objects.size).toBe(2);
  },20000);
  it("denies cross-owner reads and writes before any private object access, and rejects stale saves",async()=>{
    const f=await fixture("security");await save(f.buildProjectId,1,workspace(red));mock.read.mockClear();mock.put.mockClear();
    expect(await get(f.buildProjectId,other)).toBeNull();expect(await save(f.buildProjectId,2,workspace(blue),other)).toBeNull();
    await expect(save(f.buildProjectId,1,workspace(blue))).rejects.toMatchObject({code:"BUILD_SOURCE_CONFLICT"});
    expect(mock.read).not.toHaveBeenCalled();expect(mock.put).not.toHaveBeenCalled();
  });
  it("leaves a durable pending intent but no source/manifests after a failed object write",async()=>{
    const f=await fixture("putfail");mock.put.mockRejectedValueOnce(Error("SIMULATED_R2_FAILURE"));
    await expect(save(f.buildProjectId,1,workspace(red))).rejects.toThrow("SIMULATED_R2_FAILURE");
    expect((await head(f.codeProjectId)).currentVersion).toBe(1);
    expect(await prisma.buildManagedBinaryRevision.count({where:{buildProjectId:f.buildProjectId}})).toBe(0);
    expect(await prisma.buildManagedBinaryUploadIntent.count({where:{buildProjectId:f.buildProjectId,state:"pending"}})).toBe(1);
  });
  it("fails closed on corrupt object bytes in the real project loader",async()=>{
    const f=await fixture("corrupt");await save(f.buildProjectId,1,workspace(red));
    mock.read.mockResolvedValueOnce(Uint8Array.of(1,2,3));await expect(get(f.buildProjectId)).rejects.toThrow("MANAGED_BINARY_OBJECT_INTEGRITY_FAILURE");
  });
  it("leaves normal selected legacy writes inline when gates are off",async()=>{
    const f=await fixture("legacy");vi.stubEnv("ZOEBUILD_MANAGED_R2_WRITES","0");vi.stubEnv("ZOEBUILD_MANAGED_R2_READS","0");
    await save(f.buildProjectId,1,workspace(red));expect(mock.put).not.toHaveBeenCalled();expect(mock.read).not.toHaveBeenCalled();
    expect(JSON.stringify((await head(f.codeProjectId)).workspace)).toContain(red);expect(imageData((await get(f.buildProjectId))?.workspace)).toBe(red);
    expect(await prisma.buildManagedBinaryRevision.count({where:{buildProjectId:f.buildProjectId}})).toBe(0);
  });
  it("rejects a wrong disposable-database nonce before staging",async()=>{
    const f=await fixture("marker");vi.stubEnv("AI4B4E2E_TEST_NONCE","0".repeat(32));
    await expect(save(f.buildProjectId,1,workspace(red))).rejects.toThrow("MANAGED_PILOT_DATABASE_MARKER_INVALID");
    expect(mock.put).not.toHaveBeenCalled();expect((await head(f.codeProjectId)).currentVersion).toBe(1);
  });
  it("rejects a mismatching native PNG checksum before any R2 write or journal entry",async()=>{
    const f=await fixture("checksum");const bad=workspace(red);
    const node=bad.nodes.find(x=>x.id===imageId);
    if(node?.kind!=="file"||!node.binary)throw Error("IMAGE_FIXTURE_MISSING");
    node.binary={...node.binary,checksum:`sha256:${"0".repeat(64)}`};
    await expect(save(f.buildProjectId,1,bad)).rejects.toMatchObject({code:"BUILD_SOURCE_INVALID"});
    expect(mock.put).not.toHaveBeenCalled();expect((await head(f.codeProjectId)).currentVersion).toBe(1);
    expect(await prisma.buildManagedBinaryUploadIntent.count({where:{buildProjectId:f.buildProjectId}})).toBe(0);
  });
  it("refuses raw managed reads and legacy writes when the flags are turned off",async()=>{
    const f=await fixture("flags_off");await save(f.buildProjectId,1,workspace(red));
    const hydrated=(await get(f.buildProjectId))!.workspace;
    const before=await head(f.codeProjectId);
    vi.stubEnv("ZOEBUILD_MANAGED_R2_WRITES","0");vi.stubEnv("ZOEBUILD_MANAGED_R2_READS","0");
    mock.put.mockClear();mock.read.mockClear();
    await expect(get(f.buildProjectId)).rejects.toThrow("MANAGED_READ_DISABLED_FOR_SAVED_REVISION");
    await expect(save(f.buildProjectId,2,workspace(blue))).rejects.toThrow("Managed project writes are disabled");
    expect(await head(f.codeProjectId)).toEqual(before);
    expect(mock.put).not.toHaveBeenCalled();expect(mock.read).not.toHaveBeenCalled();
    vi.stubEnv("ZOEBUILD_MANAGED_R2_READS","1");
    expect((await get(f.buildProjectId))?.workspace).toEqual(hydrated);
    await expect(save(f.buildProjectId,2,workspace(blue))).rejects.toThrow("Managed project writes are disabled");
  });
  it("never falls back to a stripped head when a durable history marker has no manifest",async()=>{
    const f=await fixture("missing_manifest");
    await prisma.codeProjectRevision.update({where:{projectId_version:{projectId:f.codeProjectId,version:1}},data:{meta:{managedBinaryRevisionDigest:"invalid"}}});
    await expect(get(f.buildProjectId)).rejects.toThrow("MANAGED_DB_MARKED_MANIFEST_MISSING");
    expect(mock.read).not.toHaveBeenCalled();expect(mock.put).not.toHaveBeenCalled();
    vi.stubEnv("ZOEBUILD_MANAGED_R2_READS","0");vi.stubEnv("ZOEBUILD_MANAGED_R2_WRITES","0");
    await expect(get(f.buildProjectId)).rejects.toThrow("MANAGED_READ_DISABLED_FOR_SAVED_REVISION");
    await expect(save(f.buildProjectId,1,workspace(red))).rejects.toThrow("Managed project writes are disabled");
  });
  it("persists automatic dependency preparation without reuploading PNGs or moving visible history",async()=>{
    const f=await fixture("auto_deps");const initial=workspace(red);
    initial.nodes.push({id:"ai4b4k_package",kind:"file",parentId:null,name:"package.json",content:'{"packageManager":"pnpm@10.33.0","dependencies":{"react":"19.2.3"}}',createdAt:1,updatedAt:1});
    await save(f.buildProjectId,1,initial);
    const next=(await get(f.buildProjectId))!.workspace;
    next.nodes.push({id:"ai4b4k_lock",kind:"file",parentId:null,name:"pnpm-lock.yaml",content:"lockfileVersion: '9.0'",createdAt:1,updatedAt:1},
      {id:"ai4b4k_seal",kind:"file",parentId:null,name:"zoebuild-dependency-approval.json",content:"{}",createdAt:1,updatedAt:1});
    const command={access:{userId:owner,entitlements:[]},buildProjectId:f.buildProjectId,baseVersion:2,workspace:next,clientInstanceId:"zoebuild-lock-bootstrap"};
    await expect(saveCommand({...command,writer:writer(prisma)})).rejects.toMatchObject({code:"BUILD_SOURCE_INVALID"});
    const malicious=JSON.parse(JSON.stringify(next)) as WorkspaceStateV2;
    const node=malicious.nodes.find(n=>n.id==="ai4b4e2g_index_node");if(node?.kind!=="file")throw Error("MISSING_NODE");node.content="tampered";
    await expect(saveCommand({...command,workspace:malicious,writer:writer(prisma,{createRevision:false},"automatic")})).rejects.toMatchObject({code:"BUILD_SOURCE_INVALID"});
    expect((await head(f.codeProjectId)).currentVersion).toBe(2);
    const prepared=await saveCommand({...command,writer:writer(prisma,{createRevision:false},"automatic")});
    expect(prepared).toMatchObject({sourceVersion:3,changed:true});expect(mock.put).toHaveBeenCalledTimes(1);
    const {MANAGED_DEPENDENCY_PREPARATION_NOTE}=await import("./prismaManagedBinaryPort");
    const {activeSavedHistoryVersion}=await import("./activeSavedHistoryVersion");
    const row=await head(f.codeProjectId);expect(activeSavedHistoryVersion(3,row.meta)).toBe(2);
    const revisions=await prisma.codeProjectRevision.findMany({where:{projectId:f.codeProjectId,OR:[{note:null},{note:{not:MANAGED_DEPENDENCY_PREPARATION_NOTE}}]},orderBy:{version:"asc"}});
    expect(revisions.map(x=>x.version)).toEqual([1,2]);
    const internal=await prisma.codeProjectRevision.findUniqueOrThrow({where:{projectId_version:{projectId:f.codeProjectId,version:3}}});
    expect(internal.note).toBe(MANAGED_DEPENDENCY_PREPARATION_NOTE);expect(JSON.stringify(internal.snapshot)).not.toContain(red);
    const loaded=(await get(f.buildProjectId))!;expect(imageData(loaded.workspace)).toBe(red);expect(loaded.workspace.nodes.some(n=>n.name==="pnpm-lock.yaml")).toBe(true);
    const old=await historicalRead({client:prisma,ownerId:owner,buildProjectId:f.buildProjectId,sourceVersion:2,legacyWorkspace:null});
    expect(old.nodes.some(n=>n.name==="pnpm-lock.yaml")).toBe(false);expect(imageData(old)).toBe(red);
    const edited=loaded.workspace;edited.stdin="user edit";await save(f.buildProjectId,3,edited);
    expect(activeSavedHistoryVersion(4,(await head(f.codeProjectId)).meta)).toBe(4);
  },20000);
  it("keeps a trusted explicit dependency reconciliation visible and retains its new lock",async()=>{
    const f=await fixture("explicit_deps");const initial=workspace(red);
    initial.nodes.push({id:"ai4b4k_package",kind:"file",parentId:null,name:"package.json",content:'{"packageManager":"pnpm@10.33.0","dependencies":{"react":"19.2.3"}}',createdAt:1,updatedAt:1});
    await save(f.buildProjectId,1,initial);
    const next=(await get(f.buildProjectId))!.workspace;
    const pkg=next.nodes.find(n=>n.name==="package.json");if(pkg?.kind!=="file")throw Error("MISSING_PACKAGE");pkg.content='{"packageManager":"pnpm@10.33.0","dependencies":{"react":"19.2.3","lucide-react":"0.468.0"}}';
    next.nodes.push({id:"ai4b4k_lock",kind:"file",parentId:null,name:"pnpm-lock.yaml",content:"lockfileVersion: '9.0'",createdAt:1,updatedAt:1},
      {id:"ai4b4k_seal",kind:"file",parentId:null,name:"zoebuild-dependency-approval.json",content:"{}",createdAt:1,updatedAt:1});
    const command={access:{userId:owner,entitlements:[]},buildProjectId:f.buildProjectId,baseVersion:2,workspace:next,clientInstanceId:"zoebuild-lock-bootstrap"};
    await expect(saveCommand({...command,writer:writer(prisma,{createRevision:false},"automatic")})).rejects.toMatchObject({code:"BUILD_SOURCE_INVALID"});
    const applied=await saveCommand({...command,writer:writer(prisma,{},"explicit")});
    expect(applied).toMatchObject({sourceVersion:3,changed:true});expect(mock.put).toHaveBeenCalledTimes(1);
    const loaded=(await get(f.buildProjectId))!.workspace;expect(imageData(loaded)).toBe(red);
    expect(loaded.nodes.some(n=>n.name==="pnpm-lock.yaml")).toBe(true);expect(loaded.nodes.some(n=>n.name==="zoebuild-dependency-approval.json")).toBe(true);
    const {activeSavedHistoryVersion}=await import("./activeSavedHistoryVersion");expect(activeSavedHistoryVersion(3,(await head(f.codeProjectId)).meta)).toBe(3);
    const revision=await prisma.codeProjectRevision.findUniqueOrThrow({where:{projectId_version:{projectId:f.codeProjectId,version:3}}});
    expect(revision.note).toBe("ZoeBuild managed R2 source save");
    await expect(saveCommand({...command,writer:writer(prisma,{},"explicit")})).rejects.toMatchObject({code:"BUILD_SOURCE_CONFLICT"});
  });
  it("restores an older managed TanStack image revision without another PUT or visible history row",async()=>{
    const f=await fixture("restore_png");
    await prisma.buildProject.update({where:{id:f.buildProjectId},data:{stackId:"tanstack-start-v1"}});
    await save(f.buildProjectId,1,workspace(red));await save(f.buildProjectId,2,workspace(blue,"next.png"));
    const {restorePilotManagedBinaryHistory:restore}=await import("./managedBinaryPilotSourceWriter");
    const {MANAGED_INTERNAL_HISTORY_NOTES,MANAGED_HISTORY_RESTORE_NOTE}=await import("./prismaManagedBinaryPort");
    const {activeSavedHistoryVersion}=await import("./activeSavedHistoryVersion");
    const args={ownerId:owner,buildProjectId:f.buildProjectId,expectedVersion:3,restoreVersion:2};
    mock.read.mockClear();expect(await restore(prisma,{...args,ownerId:other})).toBeNull();expect(mock.read).not.toHaveBeenCalled();
    await expect(restore(prisma,{...args,expectedVersion:2,restoreVersion:1})).rejects.toThrow("MANAGED_HISTORY_RESTORE_STALE");
    await prisma.$executeRaw`INSERT INTO "BuildRun" (id,"buildProjectId",status) VALUES ('ai4b4l_active_run',${f.buildProjectId},'running')`;
    await expect(restore(prisma,args)).rejects.toThrow("MANAGED_HISTORY_ACTIVE_OPERATION");
    expect((await head(f.codeProjectId)).currentVersion).toBe(3);
    await prisma.$executeRaw`DELETE FROM "BuildRun" WHERE id='ai4b4l_active_run' AND "buildProjectId"=${f.buildProjectId}`;
    expect(await restore(prisma,args)).toEqual({sourceVersion:4,changed:true});
    expect(mock.put).toHaveBeenCalledTimes(2);
    const row=await head(f.codeProjectId);expect(activeSavedHistoryVersion(4,row.meta)).toBe(2);expect(JSON.stringify(row.workspace)).not.toContain(red);
    const loaded=await get(f.buildProjectId);expect(imageData(loaded?.workspace)).toBe(red);expect(loaded?.workspace.nodes.find(n=>n.id===imageId)?.name).toBe("hero.png");
    const visible=await prisma.codeProjectRevision.findMany({where:{projectId:f.codeProjectId,OR:[{note:null},{note:{notIn:MANAGED_INTERNAL_HISTORY_NOTES}}]},orderBy:{version:"asc"}});
    expect(visible.map(r=>r.version)).toEqual([1,2,3]);
    const hidden=await prisma.codeProjectRevision.findUniqueOrThrow({where:{projectId_version:{projectId:f.codeProjectId,version:4}}});expect(hidden.note).toBe(MANAGED_HISTORY_RESTORE_NOTE);
    const prior=await historicalRead({client:prisma,ownerId:owner,buildProjectId:f.buildProjectId,sourceVersion:3,legacyWorkspace:null});expect(imageData(prior)).toBe(blue);
    await expect(restore(prisma,{...args,expectedVersion:4})).rejects.toThrow("MANAGED_HISTORY_RESTORE_INVALID");
    expect((await head(f.codeProjectId)).currentVersion).toBe(4);
  });
  it("fails closed on missing restore objects and unsupported legacy targets",async()=>{
    const f=await fixture("restore_bad");await prisma.buildProject.update({where:{id:f.buildProjectId},data:{stackId:"tanstack-start-v1"}});
    await save(f.buildProjectId,1,workspace(red));await save(f.buildProjectId,2,workspace(blue));
    const {restorePilotManagedBinaryHistory:restore}=await import("./managedBinaryPilotSourceWriter");
    const args={ownerId:owner,buildProjectId:f.buildProjectId,expectedVersion:3,restoreVersion:2};
    await expect(restore(prisma,{...args,restoreVersion:1})).rejects.toThrow("MANAGED_HISTORY_RESTORE_MANAGED_ONLY");
    mock.read.mockImplementation(async()=>null);
    await expect(restore(prisma,args)).rejects.toThrow();
    expect((await head(f.codeProjectId)).currentVersion).toBe(3);expect(mock.put).toHaveBeenCalledTimes(2);
  });
  it("enforces exact configured origins in production and test, with loopback fallback only outside production",async()=>{
    const {enforceBuildMutationOrigin:check}=await import("../server/enforceBuildMutationOrigin");
    const url="http://localhost:3004/api/build/projects/demo/source";
    const origin="http://localhost:3004";
    const req=(headers:Record<string,string>={},target=url)=>new Request(target,{method:"PATCH",headers});
    vi.stubEnv("APP_ORIGIN",origin);
    for(const mode of ["test","production"]){
      vi.stubEnv("NODE_ENV",mode);
      expect(check(req({origin}))).toBe(true);
      expect(check(req({referer:origin+"/editor"}))).toBe(true);
      expect(check(req({origin:"https://untrusted.invalid",referer:origin+"/editor"}))).toBe(false);
      expect(check(req({origin:"null"}))).toBe(false);
      expect(check(req({origin:"http://localhost:3005"}))).toBe(false);
      expect(check(req())).toBe(false);
      expect(check(req({referer:"not a URL"}))).toBe(false);
    }
    vi.stubEnv("APP_ORIGIN",undefined);
    expect(check(req({origin}))).toBe(false);
    vi.stubEnv("NODE_ENV","test");
    expect(check(req({origin}))).toBe(true);
    expect(check(req({origin:"https://untrusted.invalid"},"https://untrusted.invalid/api"))).toBe(false);
    expect(check(req({origin:"https://untrusted.invalid","x-forwarded-host":"untrusted.invalid"}))).toBe(false);
    vi.stubEnv("APP_ORIGIN","not a URL");
    expect(check(req({origin}))).toBe(false);
  });
  it("executes the actual source PATCH and detail GET with managed bytes and HTTP ownership/version protections",async()=>{
    const f=await fixture("http_save");
    const {PATCH}=await import("../../app/api/build/projects/[buildProjectId]/source/route");
    const {GET}=await import("../../app/api/build/projects/[buildProjectId]/route");
    vi.stubEnv("APP_ORIGIN","http://localhost:3004");
    const origin="http://localhost:3004", url=`${origin}/api/build/projects/${f.buildProjectId}`;
    const ctx={params:Promise.resolve({buildProjectId:f.buildProjectId})};
    function patch(version:number, data:string, from=origin){return PATCH(new Request(`${url}/source`,{
      method:"PATCH",headers:{host:"localhost:3004",origin:from,"content-type":"application/json"},
      body:JSON.stringify({baseVersion:version,workspace:workspace(data)})}),ctx);}
    const read=()=>GET(new Request(url),ctx);
    expect((await read()).status).toBe(401);
    expect((await patch(1,red)).status).toBe(401);
    httpActor.userId=owner;
    expect((await patch(1,red,"https://untrusted.invalid")).status).toBe(403);
    expect((await patch(1,red,"null")).status).toBe(403);
    expect((await patch(1,red,"http://localhost:3005")).status).toBe(403);
    expect((await head(f.codeProjectId)).currentVersion).toBe(1);
    expect(mock.put).not.toHaveBeenCalled();
    httpActor.userId=other;
    expect((await patch(1,red)).status).toBe(404);expect((await read()).status).toBe(404);
    expect(mock.put).not.toHaveBeenCalled();expect(mock.read).not.toHaveBeenCalled();
    httpActor.userId=owner;
    const saved=await patch(1,red);expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ok:true,source:{sourceVersion:2,changed:true}});
    const response=await read();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");
    const data=await response.json();expect(data).toMatchObject({ok:true,project:{sourceVersion:2}});
    expect(imageData(data.project.workspace)).toBe(red);expect(JSON.stringify(data)).not.toContain("project-media/");
    expect(JSON.stringify((await head(f.codeProjectId)).workspace)).not.toContain(red);
    expect((await patch(1,blue)).status).toBe(409);expect(mock.put).toHaveBeenCalledTimes(1);
  },20000);
  it("executes the actual history GET and POST without leaking object keys or duplicating restored uploads",async()=>{
    const f=await fixture("http_history");
    const {parseProjectSpecification}=await import("@zoeskoul/build-application");
    const spec=parseProjectSpecification({version:1,name:"TanStack App",projectType:"fullstack-app",targets:["web"],pages:["Home"],stackId:"tanstack-start-v1",
      requirements:{backend:true,database:false,auth:false,storage:false,payments:false,email:false,commerce:false},deployment:{preference:"managed-runtime"}});
    await prisma.buildProject.update({where:{id:f.buildProjectId},data:{stackId:"tanstack-start-v1",specification:JSON.parse(JSON.stringify(spec))}});
    await save(f.buildProjectId,1,workspace(red));await save(f.buildProjectId,2,workspace(blue));
    const {GET,POST}=await import("../../app/api/build/projects/[buildProjectId]/source-history/route");
    vi.stubEnv("APP_ORIGIN","http://localhost:3004");
    const origin="http://localhost:3004", url=`${origin}/api/build/projects/${f.buildProjectId}/source-history`;
    const ctx={params:Promise.resolve({buildProjectId:f.buildProjectId})};
    const list=(query="")=>GET(new Request(url+query),ctx);
    const restore=(baseVersion:number,restoreVersion:number,from=origin)=>POST(new Request(url,{method:"POST",headers:{host:"localhost:3004",origin:from,"content-type":"application/json"},body:JSON.stringify({baseVersion,restoreVersion})}),ctx);
    mock.read.mockClear();
    expect((await list()).status).toBe(401);
    httpActor.userId=other;expect((await list()).status).toBe(404);expect((await restore(3,2)).status).toBe(404);expect(mock.read).not.toHaveBeenCalled();
    httpActor.userId=owner;
    expect((await restore(3,2,"https://untrusted.invalid")).status).toBe(403);
    expect((await restore(3,2,"null")).status).toBe(403);
    expect((await head(f.codeProjectId)).currentVersion).toBe(3);
    expect(mock.read).not.toHaveBeenCalled();
    const history=await list();expect(history.status).toBe(200);expect(await history.json()).toMatchObject({ok:true,currentVersion:3,activeVersion:3,revisions:[{version:3,restoreAvailable:false},{version:2,restoreAvailable:true},{version:1,restoreAvailable:false}]});
    const comparison=await list("?compareFrom=2&compareTo=3&expectedSourceVersion=3");expect(comparison.status).toBe(200);
    const compared=await comparison.json();expect(compared.comparison.changes).toContainEqual({path:"public/hero.png",kind:"changed",group:"other"});expect(JSON.stringify(compared)).not.toContain(red);expect(JSON.stringify(compared)).not.toContain("project-media/");
    const detail=await list("?version=2");expect(detail.status).toBe(200);const preview=await detail.json();expect(JSON.stringify(preview)).not.toContain(red);expect(JSON.stringify(preview)).not.toContain("project-media/");
    expect((await restore(2,1)).status).toBe(409);
    const restored=await restore(3,2);expect(restored.status).toBe(200);expect(await restored.json()).toMatchObject({ok:true,sourceVersion:4,activeVersion:2,restoredFromVersion:2});
    const after=await list();expect(after.status).toBe(200);expect(await after.json()).toMatchObject({currentVersion:4,activeVersion:2,revisions:[{version:3,restoreAvailable:true},{version:2,restoreAvailable:true},{version:1,restoreAvailable:false}]});
    expect(imageData((await get(f.buildProjectId))?.workspace)).toBe(red);expect(mock.put).toHaveBeenCalledTimes(2);
  },20000);
  it("reads legacy current head state rather than a distinct older history snapshot",async()=>{
    const f=await fixture("head");const next=workspace();next.stdin="fresh head";
    await prisma.codeProject.update({where:{id:f.codeProjectId},data:{workspace:JSON.parse(JSON.stringify(next))}});
    const record=await portFactory(prisma).readOwnedRevision({scope:{ownerId:owner,buildProjectId:f.buildProjectId},sourceVersion:1});
    expect(record).toMatchObject({kind:"legacy",workspace:{stdin:"fresh head"}});
  });
});
