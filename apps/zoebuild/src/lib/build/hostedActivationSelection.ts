import "server-only";
import type { PrismaClient } from "@zoeskoul/db";
import { evaluateHostedActivation, type HostedActivationResult,
  type HostedRuntimeEvidence } from "./hostedActivationEvidence";

// Server-internal persistence primitives only. No API, runtime mutation, or route
// authorization. The caller must establish entitlement and obtain runtime evidence
// from a trusted provider, never from a browser. Orchestration is a later phase.
const ID = /^[A-Za-z0-9_-]{4,128}$/;
const MAX_GENERATION = 9223372036854775807n;
const deploymentFields = { id:true, buildProjectId:true, sourceVersion:true,
  environment:true, provider:true, kind:true, status:true, artifactHash:true,
  providerRef:true } as const;
const projectFields = { id:true, status:true, stackId:true,
  codeProject:{select:{archivedAt:true}},
  hostedActivation:{select:{generation:true, deploymentId:true, activationToken:true,
    deployment:{select:deploymentFields}}} } as const;

type Scope = Readonly<{ownerId:string; buildProjectId:string}>;
type Mutation = Scope & Readonly<{expectedGeneration:bigint}> & (
  Readonly<{action:"select"; deploymentId:string; runtime:HostedRuntimeEvidence}> |
  Readonly<{action:"unpublish"}>
);
export type HostedSelectionMutationResult = Readonly<{
  generation:bigint; deploymentId:string|null; activationToken:string|null;
}>;
export class HostedSelectionError extends Error {
  constructor(readonly code:"INVALID_INPUT"|"PROJECT_INELIGIBLE"|"STALE_GENERATION"|
    "GENERATION_EXHAUSTED"|"EVIDENCE_REJECTED"|"WRITE_CONFLICT") {
    super(code); this.name = "HostedSelectionError";
  }
}
function where(scope:Scope) {
  if (typeof scope.ownerId !== "string" || typeof scope.buildProjectId !== "string" ||
      !ID.test(scope.ownerId) || !ID.test(scope.buildProjectId)) throw new HostedSelectionError("INVALID_INPUT");
  return {id:scope.buildProjectId, status:{not:"archived" as const}, stackId:"tanstack-start-v1",
    codeProject:{ownerId:scope.ownerId, archivedAt:null}};
}
function conflict(e:unknown):boolean {
  return typeof e === "object" && e !== null && "code" in e && (e.code === "P2002" || e.code === "P2034");
}

/** A successful write records the intended selection only, not public availability.
 * Unpublish revokes desired selection even if runtime shutdown has not happened.
 * A null selection row is retained to prevent ABA through generation reset.
 */
export async function commitHostedSelection(client:PrismaClient, input:Mutation):Promise<HostedSelectionMutationResult> {
  const filter = where(input);
  const expected = input.expectedGeneration;
  if (typeof expected !== "bigint" || expected < 0n || expected > MAX_GENERATION ||
      (input.action !== "select" && input.action !== "unpublish")) throw new HostedSelectionError("INVALID_INPUT");
  if (input.action === "select" && (typeof input.deploymentId !== "string" || !ID.test(input.deploymentId))) throw new HostedSelectionError("INVALID_INPUT");
  try {
    return await client.$transaction(async tx => {
      const project = await tx.buildProject.findFirst({where:filter, select:projectFields});
      if (!project || project.id !== input.buildProjectId || project.status === "archived" ||
          project.stackId !== "tanstack-start-v1" || project.codeProject.archivedAt !== null) {
        throw new HostedSelectionError("PROJECT_INELIGIBLE");
      }
      const old = project.hostedActivation;
      const generation = old?.generation ?? 0n;
      if (generation !== expected) throw new HostedSelectionError("STALE_GENERATION");
      if (generation === MAX_GENERATION) throw new HostedSelectionError("GENERATION_EXHAUSTED");
      let deploymentId:string|null = null;
      let activationToken:string|null = null;
      if (input.action === "select") {
        if (input.runtime.state !== "verified-active") throw new HostedSelectionError("EVIDENCE_REJECTED");
        const deployment = await tx.buildDeployment.findFirst({where:{id:input.deploymentId,
          buildProjectId:project.id},select:deploymentFields});
        const evidence = evaluateHostedActivation({project:{id:project.id,status:project.status,
          stackId:project.stackId,codeProjectArchived:false},deployment,
          selection:{state:"published",deploymentId:input.deploymentId,activation:input.runtime.activation},
          runtime:input.runtime});
        if (evidence.state !== "eligible") throw new HostedSelectionError("EVIDENCE_REJECTED");
        deploymentId = evidence.deploymentId;
        activationToken = evidence.activation.activatedAt;
      }
      const data = {generation:generation+1n,deploymentId,activationToken};
      if (old) {
        const result = await tx.buildHostedActivation.updateMany({where:{buildProjectId:project.id,generation},data});
        if (result.count !== 1) throw new HostedSelectionError("STALE_GENERATION");
      } else {
        await tx.buildHostedActivation.create({data:{buildProjectId:project.id,...data}});
      }
      return Object.freeze(data);
    },{isolationLevel:"Serializable"});
  } catch(e) {
    // Never silently retry with a newer generation. The operator must reread.
    if (conflict(e)) throw new HostedSelectionError("WRITE_CONFLICT");
    throw e;
  }
}

export type HostedSelectionObservation = Readonly<{generation:bigint|null; evidence:HostedActivationResult}>;
/** Compare a committed database snapshot with separately obtained runtime evidence.
 * This is a reconciliation observation, not an authorization/lease. A production
 * consumer must verify evidence freshness and recheck at the serving boundary.
 */
export async function observeOwnedHostedSelection(client:PrismaClient, scope:Scope,
    runtime:HostedRuntimeEvidence):Promise<HostedSelectionObservation> {
  const filter = where(scope);
  try {
    return await client.$transaction(async tx => {
      const p = await tx.buildProject.findFirst({where:filter,select:projectFields});
      if (!p || p.id !== scope.buildProjectId || p.status === "archived" ||
          p.stackId !== "tanstack-start-v1" || p.codeProject.archivedAt !== null) {
        return {generation:null,evidence:{state:"denied",reason:"PROJECT_INELIGIBLE"}} as const;
      }
      const row = p.hostedActivation;
      const generation = row?.generation ?? 0n;
      if (!row || (row.deploymentId === null && row.activationToken === null)) {
        return {generation,evidence:{state:"denied",reason:"UNPUBLISHED"}} as const;
      }
      const d = row.deployment;
      if (!row.deploymentId || !row.activationToken || generation <= 0n) {
        return {generation,evidence:{state:"denied",reason:"INVALID_SELECTION"}} as const;
      }
      if (!d || !d.artifactHash || !d.providerRef) {
        return {generation,evidence:{state:"denied",reason:"DEPLOYMENT_MISMATCH"}} as const;
      }
      const evidence = evaluateHostedActivation({project:{id:p.id,status:p.status,stackId:p.stackId,
        codeProjectArchived:false},deployment:d,selection:{state:"published",deploymentId:row.deploymentId,
          activation:{projectId:p.id,sourceVersion:d.sourceVersion,artifactHash:d.artifactHash,
            objectSha256:d.providerRef,activatedAt:row.activationToken}},runtime});
      return {generation,evidence};
    },{isolationLevel:"RepeatableRead"});
  } catch {
    return {generation:null,evidence:{state:"denied",reason:"AUTHORITY_UNAVAILABLE"}};
  }
}
