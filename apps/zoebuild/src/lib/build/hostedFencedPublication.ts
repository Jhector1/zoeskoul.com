import "server-only";
import type { PrismaClient } from "@zoeskoul/db";
import { productionHostedSelection } from "./hostedProductionPolicy";
import { beginHostedPublication, completeHostedPublication } from "./hostedPublicationExecutor";
import type { PendingHostedPublication } from "./hostedPublicationRecovery";
import { hostedPublishSelection, invokeHostedFencedCommand } from "./privatePublishControl";
import { encodeFencedOperation, parseFencedStatus, parseFencedAcknowledgement, type FencedStatus } from "./hostedFencedProtocol";

type Input=PendingHostedPublication & Readonly<{ownerId:string}>;
function gate(input:Input){
  const production=productionHostedSelection(input.projectId,process.env);
  const selected=production??hostedPublishSelection("http://localhost:3004",input.projectId,process.env);
  if(!selected||selected.ownerId!==input.ownerId||(!production&&process.env.ZOEBUILD_HOSTED_FENCED_DEV!=="1"))throw new Error("FENCED_PUBLISH_DISABLED");
}
async function authorize(client:PrismaClient,input:Input){
  gate(input);
  const p=await client.buildProject.findFirst({where:{id:input.projectId,status:{not:"archived"},stackId:"tanstack-start-v1",codeProject:{ownerId:input.ownerId,archivedAt:null}},select:{id:true}});
  if(!p)throw new Error("FENCED_PROJECT_DENIED");
}
async function status(input:Input):Promise<FencedStatus>{return parseFencedStatus(await invokeHostedFencedCommand(input.ownerId,input.projectId,"fenced-ack"),input.projectId);}
function finish(client:PrismaClient,input:Input,observed:FencedStatus){
  if(observed.fence===input.expectedGeneration)return {state:"await-provider" as const};
  if(observed.fence!==input.expectedGeneration+1n||observed.acknowledgement?.operationId!==input.operationId)throw new Error("FENCED_ACKNOWLEDGEMENT_MISMATCH");
  return completeHostedPublication(client,{ownerId:input.ownerId,projectId:input.projectId,operationId:input.operationId,acknowledgement:observed.acknowledgement});
}
/** Explicit server-owned dispatch; not a browser route. Requires a separately
 * initialized runtime and a ready target deployment. Unknown transport outcomes
 * propagate with journal intact; no automatic redispatch. */
export async function executeOwnedFencedPublication(client:PrismaClient,input:Input,bytes?:Uint8Array){
  await authorize(client,input);
  const frame=encodeFencedOperation(input,bytes);
  const observed=await status(input); // do not create intent against missing runtime state
  if(observed.fence!==input.expectedGeneration && (observed.fence!==input.expectedGeneration+1n || observed.acknowledgement?.operationId!==input.operationId))throw new Error("FENCED_RUNTIME_GENERATION_MISMATCH");
  const saved=await beginHostedPublication(client,input);
  if(saved.state==="completed")return saved;
  if(observed.fence===input.expectedGeneration+1n)return finish(client,input,observed);
  if(observed.fence!==input.expectedGeneration)throw new Error("FENCED_RUNTIME_GENERATION_MISMATCH");
  // Persisted intent precedes dispatch. The provider independently enforces its
  // lock and fence even if another server races this call.
  const raw=await invokeHostedFencedCommand(input.ownerId,input.projectId,"fenced-apply",frame);
  const acknowledgement=parseFencedAcknowledgement(JSON.parse(raw),input.projectId);
  return completeHostedPublication(client,{ownerId:input.ownerId,projectId:input.projectId,operationId:input.operationId,acknowledgement});
}
/** Read-only provider recovery; never creates a journal or invokes mutation. */
export async function recoverOwnedFencedPublication(client:PrismaClient,input:Input){
  await authorize(client,input);
  const row=await client.buildHostedPublicationOperation.findFirst({where:{id:input.operationId,buildProjectId:input.projectId,requestedByOwnerId:input.ownerId}});
  if(!row||row.expectedGeneration!==input.expectedGeneration||row.action!==input.action||row.targetDeploymentId!==(input.target?.deploymentId??null)||row.targetSourceVersion!==(input.target?.sourceVersion??null)||row.targetArtifactHash!==(input.target?.artifactHash??null)||row.targetObjectSha256!==(input.target?.objectSha256??null))throw new Error("FENCED_INTENT_NOT_FOUND");
  if(row.completedAt!==null)return completeHostedPublication(client,{ownerId:input.ownerId,projectId:input.projectId,operationId:input.operationId,acknowledgement:null});
  return finish(client,input,await status(input));
}
