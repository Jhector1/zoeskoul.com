import "server-only";

import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {
  BuildSourceConflictError, BuildSourceInputError,
  type BuildSourceSavePersistenceInput, type BuildSourceSavePersistenceResult,
  type BuildMediaPrivateObjectStore,
} from "@zoeskoul/build-application";
import type {PrismaClient} from "@zoeskoul/db";
import {parseBuildWorkspaceMutation, BuildWorkspaceMutationError} from "./buildWorkspaceMutation";
import {invalidateManagedDependenciesOnManifestEdit} from "./invalidateManagedDependenciesOnManifestEdit";
import {createPrismaManagedBinaryPort} from "./prismaManagedBinaryPort";
import {loadHydratedManagedBinaryRevision, prepareAndCommitManagedBinaryRevision} from "./managedBinaryCommit";
import {createDurableManagedBinaryUploader} from "./managedBinaryUploadJournal";
import {createZoeBuildPrivateR2ObjectStore} from "./cloudflareR2MediaServer";
import {inspectPrivatePng} from "./privatePngInspector";
import {hydrateVerifiedManagedBinaryWorkspace} from "./managedBinaryWorkspace";
import {ManagedBinaryRevisionError} from "./managedBinaryRevision";
import {generalManagedProjectEligible,managedBinaryWriteLane} from "./managedBinaryPrismaPolicy";

/** Disposable rehearsal only. The local browser mode also requires an exact
 * database-created owner/project/nonce marker. Production remains denied.
 */
async function requireEphemeralPilot(client: PrismaClient, projectId: string, ownerId: string): Promise<void> {
  const expected = process.env.AI4B4E2E_TEST_DATABASE_NAME ?? "";
  const nonce = process.env.AI4B4E2E_TEST_NONCE ?? "";
  const browser = process.env.NODE_ENV === "development" &&
    process.env.AI4B4E2P_BROWSER_CONFIRM === "LOCAL_BROWSER_ONLY" &&
    process.env.APP_ORIGIN === "http://localhost:3004" &&
    process.env.NEXT_PUBLIC_ZOEBUILD_ORIGIN === "http://localhost:3004";
  if ((process.env.NODE_ENV !== "test" && !browser) ||
      process.env.ZOEBUILD_MANAGED_R2_READS !== "1" ||
      process.env.ZOEBUILD_MANAGED_R2_WRITES !== "1" ||
      process.env.ZOEBUILD_MANAGED_R2_PILOT_PROJECT_ID !== projectId ||
      process.env.AI4B4E2E_CONFIRM !== "EPHEMERAL_ONLY" ||
      !/^zoebuild_ai4b4e2e_test_[0-9a-f]{12}$/.test(expected) ||
      !/^[0-9a-f]{32}$/.test(nonce)) {
    throw Error("MANAGED_PILOT_DISABLED_OR_INVALID");
  }
  const uri = new URL(process.env.DATABASE_URL ?? "");
  if (!["postgresql:", "postgres:"].includes(uri.protocol) ||
      uri.hostname !== "127.0.0.1" || uri.port !== "55432" ||
      decodeURIComponent(uri.pathname.slice(1)) !== expected) {
    throw Error("MANAGED_PILOT_DATABASE_URL_INVALID");
  }
  const identity = await client.$queryRaw<Array<{database: string; is_standby: boolean}>>`
    SELECT current_database()::text AS database, pg_is_in_recovery() AS is_standby`;
  if (identity.length !== 1 || identity[0]?.database !== expected || identity[0]?.is_standby !== false) {
    throw Error("MANAGED_PILOT_DATABASE_IDENTITY_INVALID");
  }
  const marker = await client.$queryRaw<Array<{nonce:string}>>`
    SELECT "nonce" FROM "__ai4b4e2e_guard" LIMIT 2`;
  if (marker.length !== 1 || marker[0]?.nonce !== nonce) throw Error("MANAGED_PILOT_DATABASE_MARKER_INVALID");
  if (browser) {
    const boundary = await client.$queryRaw<Array<{ownerId:string; projectId:string; nonce:string}>>`
      SELECT "ownerId", "projectId", nonce FROM public."__ai4b4e2p_browser_guard" LIMIT 2`;
    if (boundary.length !== 1 || boundary[0]?.ownerId !== ownerId ||
        boundary[0]?.projectId !== projectId || boundary[0]?.nonce !== nonce) {
      throw new Error("MANAGED_BROWSER_PILOT_SCOPE_INVALID");
    }
  }
}

async function requireManagedWriteLane(client:PrismaClient,projectId:string,ownerId:string) {
  const lane=managedBinaryWriteLane(projectId);
  if (!lane) throw new BuildSourceInputError("Managed source writes are disabled.");
  if (lane === "pilot") await requireEphemeralPilot(client,projectId,ownerId);
  return lane;
}

/** Reuse the actual source-save writer, validator and dependency invalidation.
 * Undefined means the selected legacy project has no managed PNGs and can use
 * the ordinary source writer. A failed managed operation NEVER falls back.
 * Non-PNG formats have not passed full decoder/manifest parity; refuse mixed
 * eligible-image saves in this pilot rather than invent a decoder.
 */
export async function savePilotManagedBinarySource(
  client: PrismaClient,
  input: BuildSourceSavePersistenceInput,
  options: Readonly<{createRevision?:boolean}> = {},
  trustedDependencyMode?: "automatic" | "explicit",
): Promise<BuildSourceSavePersistenceResult | null | undefined> {
  const general = (await requireManagedWriteLane(client,input.buildProjectId,input.ownerId)) === "general";
  const scope = {ownerId: input.ownerId.trim(), buildProjectId: input.buildProjectId.trim()};
  if (!scope.ownerId || !scope.buildProjectId || !Number.isSafeInteger(input.baseVersion) || input.baseVersion < 1) {
    throw new BuildSourceInputError("Invalid managed source scope or version.");
  }
  async function readHead() {
    return client.buildProject.findFirst({
      where:{id:scope.buildProjectId,status:{not:"archived"},codeProject:{ownerId:scope.ownerId,archivedAt:null}},
      select:{stackId:true,codeProject:{select:{id:true,title:true,language:true,currentVersion:true,updatedAt:true,workspace:true,visibility:true,shareToken:true}}},
    });
  }
  function conflict(head: NonNullable<Awaited<ReturnType<typeof readHead>>>): never {
    throw new BuildSourceConflictError({serverVersion:head.codeProject.currentVersion,
      serverUpdatedAt:head.codeProject.updatedAt.toISOString(),title:head.codeProject.title});
  }
  const head = await readHead();
  if (!head) return null;
  if (head.codeProject.currentVersion !== input.baseVersion) return conflict(head);
  if (general && !generalManagedProjectEligible(head)) return undefined; // legacy writer independently rejects a managed head
  if (head.codeProject.visibility !== "private") throw new BuildSourceInputError("Managed source requires a private project.");
  const parsed = parseBuildWorkspaceMutation(input.workspace);
  if (parsed.language !== head.codeProject.language) throw new BuildWorkspaceMutationError([
    "Workspace language cannot change during a ZoeBuild source save.",
  ]);
  const port = createPrismaManagedBinaryPort(client, {internalDependencyPreparation: trustedDependencyMode === "automatic", general});
  const existing = await port.readOwnedRevision({scope,sourceVersion:input.baseVersion});
  if (!existing) throw Error("MANAGED_PILOT_BASE_NOT_FOUND");
  const hasPng = parsed.nodes.some(node => node.kind === "file" && node.binary?.mimeType === "image/png");
  // Bootstrap must use a server-selected mode, not a browser-controlled clientInstanceId.
  const bootstrap = input.clientInstanceId === "zoebuild-lock-bootstrap";
  if (existing.kind === "legacy" && (trustedDependencyMode || !hasPng)) return undefined;
  if (bootstrap !== Boolean(trustedDependencyMode) ||
      (options.createRevision === false) !== (trustedDependencyMode === "automatic")) {
    throw new BuildSourceInputError("Managed dependency preparation requires a trusted server writer.");
  }
  const unsupported = new Set(["image/jpeg","image/webp","image/avif"]);
  if (parsed.nodes.some(node => node.kind === "file" && node.binary && unsupported.has(node.binary.mimeType))) {
    throw new BuildSourceInputError("Managed source supports PNG only; other eligible image formats are not yet enabled.");
  }
  // Require the browser's checksum for managed PNGs so a newly saved workspace
  // matches the checksum-bearing canonical hydration used by Runner attestation.
  for (const node of parsed.nodes) {
    if (node.kind!=="file" || node.binary?.mimeType!=="image/png") continue;
    const digest=createHash("sha256").update(Buffer.from(node.binary.data,"base64")).digest("hex");
    if (node.binary.checksum!==`sha256:${digest}`) {
      throw new BuildSourceInputError("Managed PNG import requires a matching SHA-256 checksum. Re-import using the FullIDE editor.");
    }
  }
  // Lazily resolve the trusted object store; no R2 secret access for legacy/no-op paths.
  let objectStore: BuildMediaPrivateObjectStore | undefined;
  const store: BuildMediaPrivateObjectStore = {
    putIfAbsent: request => (objectStore ??= createZoeBuildPrivateR2ObjectStore()).putIfAbsent(request),
    read: key => (objectStore ??= createZoeBuildPrivateR2ObjectStore()).read(key),
  };
  const before = existing.kind === "legacy" ? parseBuildWorkspaceMutation(head.codeProject.workspace)
    : await loadHydratedManagedBinaryRevision({scope,sourceVersion:input.baseVersion,port,readObject:key=>store.read(key)});
  if (!before) throw Error("MANAGED_PILOT_BASE_NOT_FOUND");
  const previousWorkspace = parseBuildWorkspaceMutation(before);
  if (trustedDependencyMode) {
    // Trusted preparation may only change root dependency controls. In particular it
    // may not write new image bytes, remove images, or change any application file.
    const controls = new Set(["package.json", "pnpm-lock.yaml", "zoebuild-dependency-approval.json"]);
    const isControl = (node: typeof parsed.nodes[number]) => node.kind === "file" &&
      node.parentId === null && !node.binary && controls.has(node.name);
    const ordinary = (value: typeof parsed) => value.nodes.filter(node => !isControl(node))
      .sort((a,b) => a.id.localeCompare(b.id));
    const manifest = (value: typeof parsed) => value.nodes.find(node => node.kind === "file" &&
      node.parentId === null && node.name === "package.json");
    const oldPackage = manifest(previousWorkspace), newPackage = manifest(parsed);
    if (!isDeepStrictEqual(ordinary(previousWorkspace), ordinary(parsed)) ||
        oldPackage?.kind !== "file" || newPackage?.kind !== "file" ||
        (trustedDependencyMode === "automatic" && oldPackage.content !== newPackage.content)) {
      throw new BuildSourceInputError("Managed dependency preparation cannot modify application files or automatic package selections.");
    }
  }
  const workspace = trustedDependencyMode ? parsed :
    invalidateManagedDependenciesOnManifestEdit(previousWorkspace,parsed);
  if (existing.kind === "managed" && isDeepStrictEqual(before, workspace)) {
    // Re-read head before returning a no-op, also refusing a concurrent replacement.
    const current = await readHead();
    if (!current) return null;
    if (current.codeProject.currentVersion !== input.baseVersion) return conflict(current);
    return {sourceVersion: input.baseVersion,changed:false,workspaceChanged:false,updatedAt:current.codeProject.updatedAt.toISOString()};
  }
  const uploader = createDurableManagedBinaryUploader({scope,baseVersion:input.baseVersion,client,store,
    inspectPng:async bytes=>inspectPrivatePng(bytes),general});
  let committed: Awaited<ReturnType<typeof prepareAndCommitManagedBinaryRevision>>;
  try {
    committed = await prepareAndCommitManagedBinaryRevision({scope,baseVersion:input.baseVersion,
      previous:existing.kind === "managed" ? existing.revision : {...scope,sourceVersion:input.baseVersion,bindings:[]},
      workspace,upload:uploader.upload,journal:uploader.journal,port});
  } catch (error) {
    // R2 staging may see a stale base before the DB CAS, or the DB may reject
    // concurrent Serializable writes. Preserve the domain's conflict response.
    const current = await readHead();
    if (current && current.codeProject.currentVersion !== input.baseVersion) return conflict(current);
    if (error instanceof ManagedBinaryRevisionError && error.code === "MANAGED_UPLOAD_STORAGE_LIMIT")
      throw new BuildSourceInputError("Managed image storage limit reached. Existing saved versions are preserved.");
    throw error;
  }
  const saved = await readHead();
  if (!saved) throw Error("MANAGED_PILOT_COMMITTED_PROJECT_NOT_FOUND");
  const revisionTime = saved.codeProject.currentVersion === committed.sourceVersion
    ? saved.codeProject.updatedAt
    : (await client.codeProjectRevision.findUnique({where:{projectId_version:{projectId:head.codeProject.id,version:committed.sourceVersion}},select:{createdAt:true}}))?.createdAt;
  if (!revisionTime) throw Error("MANAGED_PILOT_COMMITTED_REVISION_NOT_FOUND");
  return {sourceVersion:committed.sourceVersion,changed:true,workspaceChanged:true,updatedAt:revisionTime.toISOString()};
}

/** A selected, immutable managed revision can become the new source head
 * without another object PUT. Same-stack and unchanged settings only; the
 * database transaction independently checks the source and manifest again.
 * Uses the same server-owned managed-write lane as normal saves.
 */
export async function restorePilotManagedBinaryHistory(client: PrismaClient, args: Readonly<{
  ownerId:string; buildProjectId:string; expectedVersion:number; restoreVersion:number;
}>): Promise<{sourceVersion:number; changed:boolean} | null> {
  const general = (await requireManagedWriteLane(client,args.buildProjectId,args.ownerId)) === "general";
  const scope={ownerId:args.ownerId,buildProjectId:args.buildProjectId};
  if (!Number.isSafeInteger(args.expectedVersion) || !Number.isSafeInteger(args.restoreVersion) ||
      args.restoreVersion<1 || args.restoreVersion>=args.expectedVersion) {
    throw new ManagedBinaryRevisionError("MANAGED_HISTORY_RESTORE_INVALID");
  }
  const head=await client.buildProject.findFirst({where:{id:scope.buildProjectId,stackId:"tanstack-start-v1",
    status:{not:"archived"},codeProject:{ownerId:scope.ownerId,archivedAt:null,visibility:"private"}},
    select:{codeProject:{select:{currentVersion:true}}}});
  if (!head) return null;
  if (head.codeProject.currentVersion!==args.expectedVersion) throw new ManagedBinaryRevisionError("MANAGED_HISTORY_RESTORE_STALE");
  const port=createPrismaManagedBinaryPort(client,{historicalRestoreVersion:args.restoreVersion,general});
  const [current,target]=await Promise.all([
    port.readOwnedRevision({scope,sourceVersion:args.expectedVersion}),
    port.readOwnedRevision({scope,sourceVersion:args.restoreVersion}),
  ]);
  if (current?.kind!=="managed" || target?.kind!=="managed") throw new ManagedBinaryRevisionError("MANAGED_HISTORY_RESTORE_MANAGED_ONLY");
  // Verify that the selected immutable object bytes still exist and are correct
  // before any source mutation. The returned workspace is not persisted inline.
  const hydrated=await hydrateVerifiedManagedBinaryWorkspace({scope,revision:target.revision,
    sourceVersion:args.restoreVersion,stored:target.snapshot,
    readObject:key=>createZoeBuildPrivateR2ObjectStore().read(key)});
  parseBuildWorkspaceMutation(hydrated);
  const sourceVersion=args.expectedVersion+1;
  const restored=await port.commitOwnedRevision({scope,expectedBaseVersion:args.expectedVersion,sourceVersion,
    snapshot:{...target.snapshot,sourceVersion},revision:{...target.revision,sourceVersion}});
  if (restored.kind!=="committed") throw new ManagedBinaryRevisionError("MANAGED_HISTORY_RESTORE_STALE");
  return {sourceVersion:restored.sourceVersion,changed:true};
}
