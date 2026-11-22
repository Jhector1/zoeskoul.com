import type { TanstackWorkerArtifactV1, TanstackWorkerRuntimeSmokeV1 } from "@zoeskoul/build-executor-contracts";
import { performance } from "node:perf_hooks";
import { docker } from "../docker/dockerClient.js";
import { buildProductionBuildContainerOptions } from "./executeProductionBuild.js";
import { fetchTanstackHttpInsideSandbox, probeTanstackListenerInsideSandbox, retireTanstackHttpWorker } from "./tanstackPreviewDockerTransport.js";
import { isTanstackSsrReady, TANSTACK_PREVIEW_OFFLINE_ENV } from "./tanstackPreviewRuntimePolicy.js";
import { workerSmokeCommand, selectWorkerSmokeAssets } from "./tanstackWorkerRuntimePolicy.js";
import { readTanstackWorkerArtifact } from "./tanstackWorkerArtifact.js";

export function workerSmokeContainerOptions(workspaceDir: string, artifact: TanstackWorkerArtifactV1, runId: string) {
  const command = workerSmokeCommand(artifact);
  const base = buildProductionBuildContainerOptions({workspaceDir, command, step:"build"});
  const options = {...base,
    Env:[...base.Env, TANSTACK_PREVIEW_OFFLINE_ENV, "WRANGLER_SEND_METRICS=false", "NODE_ENV=production"],
    Labels:{...base.Labels,"com.zoeskoul.runner.tanstack-run":runId,
      "com.zoeskoul.runner.build-step":"worker-runtime"},
    HostConfig:{...base.HostConfig, Binds:[`${workspaceDir}:/workspace:ro`],
      NetworkMode:"none", LogConfig:{Type:"local",Config:{"max-size":"1m","max-file":"1"}}},
  };
  const h=options.HostConfig;
  if (!/^[1-9]\d*:\d+$/.test(options.User) || h.Privileged !== false || h.ReadonlyRootfs !== true ||
      !h.CapDrop.includes("ALL") || !h.SecurityOpt.includes("no-new-privileges:true") ||
      ![h.Memory,h.CpuQuota,h.CpuPeriod,h.PidsLimit].every(n=>Number.isFinite(n)&&n>0) ||
      h.MemorySwap!==h.Memory || !/^\/[^:\r\n]+$/.test(workspaceDir))
    throw new Error("Unsafe Worker smoke sandbox.");
  return options;
}

/** This is limited HTTP smoke evidence, not browser hydration or a security
 * attestation for hostile application behavior. Existing build capacity owns it. */
export async function runTanstackWorkerRuntimeSmoke(input: Readonly<{
  workspaceDir:string; artifact:TanstackWorkerArtifactV1; runId:string;
  onContainerCreated:(id:string)=>Promise<void>; onContainerRemoved:()=>Promise<void>;
}>):Promise<TanstackWorkerRuntimeSmokeV1> {
  let stage: Extract<TanstackWorkerRuntimeSmokeV1,{state:"failed"}>["stage"]="configuration";
  const failed=():TanstackWorkerRuntimeSmokeV1=>({state:"failed",stage,artifactSha256:input.artifact.sha256});
  let options:ReturnType<typeof workerSmokeContainerOptions>;
  try { options=workerSmokeContainerOptions(input.workspaceDir,input.artifact,input.runId); }
  catch { return failed(); }
  stage="startup";
  const container=await docker.createContainer(options);
  let result:TanstackWorkerRuntimeSmokeV1;
  try {
    await input.onContainerCreated(container.id);
    await container.start();
    const until=performance.now()+45_000;
    const hardDeadline=performance.now()+75_000;
    const bounded = async <T>(operation: Promise<T>, deadline: number): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([operation,new Promise<never>((_,reject)=>{
          timer=setTimeout(()=>reject(new Error("Worker smoke deadline.")),Math.max(1,deadline-performance.now()));
        })]);
      } finally { if(timer) clearTimeout(timer); }
    };
    let listening=false;
    while(performance.now()<until) {
      listening=await bounded(probeTanstackListenerInsideSandbox(container.id,500),until).catch(()=>false);
      if(listening) break;
      if(performance.now()>=until || !(await bounded(container.inspect(),until)).State.Running) break;
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(!listening || performance.now()>=until) throw new Error("Worker listener unavailable.");
    const get=(path:string,accept:string)=>{
      if(performance.now()>=hardDeadline) throw new Error("Worker smoke deadline.");
      return bounded(fetchTanstackHttpInsideSandbox(container.id,{method:"GET",path,headers:{accept},bodyBase64:""}),hardDeadline);
    };
    stage="ssr";
    const home=await get("/","text/html");
    if(!isTanstackSsrReady(home)) throw new Error("Worker SSR not ready.");
    stage="health";
    const health=await get("/api/health","application/json");
    const payload:unknown=JSON.parse(Buffer.from(health.bodyBase64,"base64").toString("utf8"));
    if(health.status!==200 || !/^application\/json(?:\s*;|$)/i.test(health.headers["content-type"]??"") ||
      !payload || typeof payload!=="object" || (payload as {ok?:unknown}).ok!==true ||
      (payload as {service?:unknown}).service!=="generated-application") throw new Error("Worker health mismatch.");
    stage="client-assets";
    const assets=selectWorkerSmokeAssets(input.artifact,Buffer.from(home.bodyBase64,"base64").toString("utf8"));
    for(const asset of assets){
      const response=await get("/"+asset.path.slice(7),"*/*");
      const mime=response.headers["content-type"]??"";
      if(response.status!==200 || response.bodyBase64!==asset.data ||
        (/\.css$/.test(asset.path)?!/^text\/css(?:\s*;|$)/i.test(mime):! /^(?:text|application)\/(?:javascript|ecmascript)(?:\s*;|$)/i.test(mime)))
        throw new Error("Worker client asset mismatch.");
    }
    result={state:"passed",artifactSha256:input.artifact.sha256,homeStatus:200,healthStatus:200,verifiedClientAssets:2};
  } catch { result=failed(); }
  finally {
    // Stop the application before the workspace is reclaimed. Journal identity
    // must remain if removal fails. A failed teardown is not a smoke receipt.
    try { await container.remove({force:true}); }
    catch(error){ if(!(typeof error==="object" && error!==null && "statusCode" in error && error.statusCode===404)) throw error; }
    await retireTanstackHttpWorker(container.id);
    await input.onContainerRemoved();
  }
  if((await readTanstackWorkerArtifact(input.workspaceDir)).sha256!==input.artifact.sha256)
    throw new Error("Worker artifact changed during smoke verification.");
  return result;
}
