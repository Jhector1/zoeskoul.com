/**
 * Operator-only, one-shot integration acceptance. Runs from a temporary Runner
 * service container while the normal ZoeBuild Runner is STOPPED; never exposed
 * by HTTP and never toggles the customer-visible TanStack enable flag.
 *
 * Uses existing workspace, trusted Docker install, signed approval, shared
 * preview admission/registry, private HTTP transport and cleanup utilities.
 */
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { docker } from "../services/docker/dockerClient.js";
import { env } from "../lib/env.js";
import { createWorkspace } from "../services/workspace/createWorkspace.js";
import { ensureWorkspaceWritableForShellUser } from "../services/workspace/workspacePermissions.js";
import { cleanupWorkspaceNow } from "../services/workspace/cleanupWorkspace.js";
import { executeBuildStep } from "../services/build/executeProductionBuild.js";
import { sealProjectDependencies } from "@zoeskoul/build-preparation";
import { authorizeTanstackPreviewSource } from "../services/build/tanstackPreviewSourceAuthorization.js";
import { sharedFullStackPreviews } from "../services/build/sharedPreviewRegistry.js";
import {
  startAdmittedTanstackPreview, stopAdmittedTanstackPreview,
  fetchAdmittedTanstackPreview, fetchOwnedTanstackPreview,
} from "../services/build/tanstackPreviewSharedLifecycle.js";
import { resolveTanstackPreviewIdentity } from "../services/build/tanstackPreviewIdentity.js";
import { assertOperatorCanaryEnvironment, canaryBuildRequest, validateOperatorCanarySource } from "./tanstackCanaryPolicy.js";

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`P3B3_ACCEPTANCE_FAIL: ${message}`);
}
async function notFound(promise: Promise<unknown>): Promise<boolean> {
  try { await promise; return false; }
  catch (e) { return (e as {code?:string; statusCode?:number})?.code === "ENOENT" ||
    (e as {statusCode?:number})?.statusCode === 404; }
}
async function assertThrows(operation: () => Promise<unknown>, label: string): Promise<void> {
  let rejected = false;
  try { await operation(); } catch { rejected = true; }
  expect(rejected, label);
}
async function readBundle() {
  const parts: Buffer[] = [];
  let size=0;
  for await (const chunk of process.stdin) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    expect(size <= 256 * 1024, "source bundle too large");
    parts.push(part);
  }
  return validateOperatorCanarySource(JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown);
}
async function managedContainerIds() {
  // Include build-install AND preview containers so failed bootstrap cleanup
  // cannot be misreported as a successful no-leak acceptance.
  const list = await docker.listContainers({all:true, filters:{label:["com.zoeskoul.runner=true"]}});
  return new Set(list.map(item => item.Id));
}
async function workspaceIds() {
  const entries = await fs.readdir(env.workspaceRoot);
  return new Set(entries.filter(name => /^zoeskoul-run-[a-f0-9-]+$/.test(name)));
}
function equalSets(a:Set<string>,b:Set<string>) {
  return a.size === b.size && [...a].every(id => b.has(id));
}
function textBody(response:{bodyBase64:string}) {
  return Buffer.from(response.bodyBase64,"base64").toString("utf8");
}

async function main():Promise<void> {
  assertOperatorCanaryEnvironment(process.env);
  expect(process.stdin.isTTY !== true, "canary requires canonical source over stdin");
  const files = await readBundle();
  const secret = process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET!;
  const projectId = `p3b3-canary-${randomUUID()}`;
  const ownerKey = `p3b3-operator-${randomUUID()}`;
  const beforeContainers = await managedContainerIds();
  const beforeWorkspaces = await workspaceIds();
  expect(beforeContainers.size === 0 && beforeWorkspaces.size === 0,
    "ZoeBuild executor must be drained before the isolated operator test");
  expect(sharedFullStackPreviews.count() === 0, "Preview registry not empty");
  let bootstrapDir: string | null = null;
  let previewId: string | null = null;
  let ownedContainerId: string | null = null;
  let ownedWorkspaceDir: string | null = null;
  let completed = false;
  let primaryFailure: unknown = null;
  try {
    // Use the existing trusted, scriptless build-install profile. No user
    // supplied commands or Docker options; this is a fixed operator contract.
    bootstrapDir = await createWorkspace(files.filter(file => file.path === "package.json"));
    await ensureWorkspaceWritableForShellUser(bootstrapDir);
    await executeBuildStep({ workspaceDir:bootstrapDir,
      command:["pnpm","install","--lockfile-only","--ignore-scripts"], step:"install" });
    const lock = await fs.readFile(`${bootstrapDir}/pnpm-lock.yaml`,"utf8");
    expect(lock.trim().length > 0 && Buffer.byteLength(lock) <= 2*1024*1024, "invalid frozen lock");
    // Close the bootstrap workspace before measuring the one live preview.
    // This also proves install cleanup does not leak rootless-owned files.
    await cleanupWorkspaceNow(bootstrapDir);
    bootstrapDir = null;
    console.log("P3B3_FROZEN_LOCK_RESOLVED_PASS");
    const approved = sealProjectDependencies({projectId,packageJson:files.find(f=>f.path==="package.json")!.content,
      lockfile:lock,secret});
    const request = canaryBuildRequest(projectId,[...files,
      {path:"pnpm-lock.yaml",content:lock},
      {path:"zoebuild-dependency-approval.json",content:approved}]);
    authorizeTanstackPreviewSource(request,secret);
    await assertThrows(async()=>authorizeTanstackPreviewSource({...request,buildProjectId:projectId+"-wrong"},secret),
      "signature must reject other project");
    await assertThrows(async()=>authorizeTanstackPreviewSource({...request,files:request.files.map(f=>
      f.path==="pnpm-lock.yaml"?{...f,content:f.content+"\n# tamper"}:f)},secret),
      "signature must reject lock mutation");
    console.log("P3B3_SIGNED_PROJECT_DEPENDENCIES_PASS");
    const identity = await resolveTanstackPreviewIdentity(request);
    const preview = await startAdmittedTanstackPreview({ownerKey,request,identity,authorize:async(owner,source)=>{
      expect(owner===ownerKey && source.buildProjectId===projectId && source.sourceVersion===1,
        "source ownership identity mismatch");
      authorizeTanstackPreviewSource(source,secret);
    }});
    previewId = preview.previewId;
    const lease=sharedFullStackPreviews.get(previewId);
    expect(lease && lease.buildProjectId===projectId,"missing admitted lease");
    ownedContainerId=lease.containerId;
    // The canary owns the only preview lease. Physical workspace identity is
    // collected from the single newly created workspace, never guessed.
    const active=await workspaceIds();
    const additions=[...active].filter(id=>!beforeWorkspaces.has(id));
    expect(additions.length===1,"expected one sandbox workspace");
    ownedWorkspaceDir=`${env.workspaceRoot}/${additions[0]}`;
    const home=await fetchOwnedTanstackPreview({ownerKey,previewId,buildProjectId:projectId,sourceVersion:1,
      path:preview.basePath,method:"GET"});
    expect(home.status===200 && textBody(home).includes("Make something people love"),"SSR server-function loader failed");
    const about=await fetchAdmittedTanstackPreview({previewId,path:preview.basePath+"about",method:"GET"});
    expect(about.response.status===200 && textBody(about.response).includes("Thoughtfully built"),"SSR about failed");
    console.log("P3B3_SSR_AND_SERVER_LOADER_PASS");
    const health=await fetchOwnedTanstackPreview({ownerKey,previewId,buildProjectId:projectId,sourceVersion:1,
      path:preview.basePath+"api/health",method:"GET",headers:{accept:"application/json"}});
    const payload=JSON.parse(textBody(health)) as {ok?:boolean;service?:string};
    expect(health.status===200 && payload.ok===true && payload.service==="generated-application","generated API failed");
    console.log("P3B3_SERVER_API_PASS");
    await assertThrows(()=>fetchOwnedTanstackPreview({ownerKey:"other",previewId:previewId!,buildProjectId:projectId,
      sourceVersion:1,path:preview.basePath,method:"GET"}),"cross-owner fetch not rejected");
    await assertThrows(()=>fetchOwnedTanstackPreview({ownerKey,previewId:previewId!,buildProjectId:projectId,
      sourceVersion:2,path:preview.basePath,method:"GET"}),"stale source not rejected");
    await assertThrows(()=>fetchAdmittedTanstackPreview({previewId:previewId!,path:preview.basePath+"api/health",
      method:"POST",headers:{"content-type":"application/json"},bodyBase64:"e30="}),"bearer POST not rejected");
    await assertThrows(()=>stopAdmittedTanstackPreview("other",previewId!),"cross-owner stop not rejected");
    console.log("P3B3_OWNER_BOUNDARY_PASS");
    // The canonical source exposes no POST mutation handler. A trusted owner
    // can transport POST, but the generated application must reject this path.
    const post=await fetchOwnedTanstackPreview({ownerKey,previewId,buildProjectId:projectId,sourceVersion:1,
      path:preview.basePath+"api/health",method:"POST",
      headers:{accept:"application/json","content-type":"application/json"},bodyBase64:"e30="});
    expect(post.status>=400 && post.status<500,"unexpected generated API POST mutation success");
    console.log("P3B3_OWNER_POST_TRANSPORT_PASS");
    await stopAdmittedTanstackPreview(ownerKey,previewId);
    previewId=null;
    expect(ownedContainerId && await notFound(docker.getContainer(ownedContainerId).inspect()),"preview Docker resource still exists");
    expect(ownedWorkspaceDir && await notFound(fs.lstat(ownedWorkspaceDir)),"preview workspace still exists");
    completed=true;
  } catch (error) {
    // Preserve the original install/startup error. Cleanup diagnostics must
    // never replace it with a secondary generic leak assertion.
    primaryFailure = error;
    throw error;
  } finally {
    // Attempt every cleanup/verification step even if an earlier step fails.
    // Only fixed identifiers are logged, never source, paths, or Docker logs.
    const cleanupFailures: string[] = [];
    if (previewId !== null) {
      try { await stopAdmittedTanstackPreview(ownerKey, previewId); }
      catch { cleanupFailures.push("preview-stop"); }
    }
    if (bootstrapDir !== null) {
      try { await cleanupWorkspaceNow(bootstrapDir); }
      catch { cleanupFailures.push("bootstrap-workspace"); }
    }
    try {
      if (!equalSets(beforeContainers, await managedContainerIds()))
        cleanupFailures.push("sandbox-containers");
    } catch { cleanupFailures.push("container-inspection"); }
    try {
      if (!equalSets(beforeWorkspaces, await workspaceIds()))
        cleanupFailures.push("sandbox-workspaces");
    } catch { cleanupFailures.push("workspace-inspection"); }
    if (sharedFullStackPreviews.count() !== 0) cleanupFailures.push("preview-leases");
    if (cleanupFailures.length) {
      console.error("P3B3_OPERATOR_CLEANUP_INCOMPLETE", { stages: cleanupFailures });
      if (primaryFailure === null)
        throw new Error("P3B3_ACCEPTANCE_FAIL: sandbox cleanup incomplete");
    }
  }
  expect(completed,"canary incomplete");
  console.log("P3B3_PREVIEW_LIFECYCLE_CLEANUP_PASS");
  console.log("P3B3_OPERATOR_CANARY_ACCEPTANCE_PASS");
}

void main().catch(error=>{
  console.error("P3B3_OPERATOR_CANARY_FAIL",error instanceof Error?error.message:"unknown failure");
  process.exitCode=1;
});
