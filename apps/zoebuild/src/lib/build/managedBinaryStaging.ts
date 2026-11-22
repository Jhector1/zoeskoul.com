/**
 * AI4B4E2A: server-only planning and staging for canonical FullIDE image nodes.
 *
 * No route calls this yet. The upload port MUST be an owner-authorized, private
 * staging store whose uncommitted objects do not appear in public media lists.
 * Its future caller must commit the resulting revision in the SAME transaction
 * as the source compare-and-swap, or discard staged objects on failure.
 * Do not serialize the returned R2 metadata into generated application source.
 */
import {
  planNextManagedBinaryRevision,
  validateManagedBinaryPath,
  validateManagedBinaryRevision,
  validateServerVerifiedBinaryAsset,
  ManagedBinaryRevisionError,
  type ManagedBinaryRevision,
  type ManagedBinaryScope,
  type ServerVerifiedBinaryAsset,
  type ManagedBinaryRevisionFile,
} from "./managedBinaryRevision";

export type NativeBinaryNode = Readonly<{
  id: string;
  kind: "folder" | "file";
  name: string;
  parentId: string | null;
  content?: string;
  binary?: Readonly<{
    encoding: string;
    data: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}>;

export type PrivateStagingUpload = (request: Readonly<{
  path: string;
  bytes: Uint8Array;
  mimeType: string;
}>) => Promise<ServerVerifiedBinaryAsset>;

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // current FullIDE import limit
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // current canonical source workspace limit
const MAX_FILES = 150;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function fail(code: string): never { throw new ManagedBinaryRevisionError(code); }

function fullPath(nodeId: string, byId: Map<string, NativeBinaryNode>, visiting: Set<string>, cache: Map<string,string>): string {
  const existing = cache.get(nodeId);
  if (existing !== undefined) return existing;
  if (visiting.has(nodeId)) return fail("MANAGED_BINARY_PARENT_CYCLE");
  const node = byId.get(nodeId);
  if (!node) return fail("MANAGED_BINARY_PARENT_MISSING");
  if (!node.name || node.name === "." || node.name === ".." || node.name.includes("/") || node.name.includes("\\"))
    return fail("MANAGED_BINARY_NODE_NAME_INVALID");
  visiting.add(nodeId);
  let parent = "";
  if (node.parentId !== null) {
    const up = byId.get(node.parentId);
    if (!up || up.kind !== "folder") return fail("MANAGED_BINARY_PARENT_INVALID");
    parent = `${fullPath(up.id,byId,visiting,cache)}/`;
  }
  visiting.delete(nodeId);
  const path = parent + node.name;
  cache.set(nodeId,path);
  return path;
}

function assertImageHeader(bytes: Uint8Array, mimeType: string): void {
  const match=(at:number, sig:readonly number[])=>sig.every((v,i)=>bytes[at+i]===v);
  const valid=mimeType === "image/png"
    ? bytes.length >= 24 && match(0,[137,80,78,71,13,10,26,10])
    : mimeType === "image/jpeg"
      ? bytes.length >= 4 && match(0,[255,216,255])
      : mimeType === "image/webp"
        ? bytes.length >= 16 && match(0,[82,73,70,70]) && match(8,[87,69,66,80])
        : mimeType === "image/avif"
          ? bytes.length >= 16 && match(4,[102,116,121,112]) &&
            (match(8,[97,118,105,102]) || match(8,[97,118,105,115]))
          : false;
  if (!valid) fail("MANAGED_BINARY_SIGNATURE_INVALID");
}

function extractImageNodes(nodes: readonly NativeBinaryNode[]): readonly Readonly<{
  nodeId: string;
  path: string;
  bytes: Uint8Array;
  mimeType: string;
}>[] {
  if (!Array.isArray(nodes) || nodes.length > 500) return fail("MANAGED_BINARY_WORKSPACE_INVALID");
  const byId = new Map<string,NativeBinaryNode>();
  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || !node.id || byId.has(node.id))
      return fail("MANAGED_BINARY_NODE_INVALID");
    byId.set(node.id,node);
  }
  const cache = new Map<string,string>();
  const images: {nodeId:string;path:string;bytes:Uint8Array;mimeType:string}[] = [];
  const seenPaths = new Set<string>();
  let totalBytes = 0;
  for (const node of nodes) {
    if (node.kind !== "file" || !node.binary || !IMAGE_MIMES.has(node.binary.mimeType)) continue;
    const path = validateManagedBinaryPath(fullPath(node.id,byId,new Set<string>(),cache),node.binary.mimeType);
    const folded = path.toLocaleLowerCase("en-US");
    if (seenPaths.has(folded)) return fail("MANAGED_BINARY_PATH_CONFLICT");
    seenPaths.add(folded);
    const b = node.binary;
    if (b.encoding !== "base64" || typeof b.data !== "string" || !BASE64.test(b.data) ||
        b.data.length === 0 || b.data.length > 4*Math.ceil(MAX_IMAGE_BYTES/3) || !Number.isSafeInteger(b.sizeBytes) || b.sizeBytes < 1 ||
        b.sizeBytes > MAX_IMAGE_BYTES || node.content !== "") return fail("MANAGED_BINARY_INPUT_INVALID");
    const bytes = Buffer.from(b.data,"base64");
    if (bytes.byteLength !== b.sizeBytes || bytes.toString("base64") !== b.data)
      return fail("MANAGED_BINARY_BASE64_INVALID");
    assertImageHeader(bytes,b.mimeType);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) return fail("MANAGED_BINARY_TOTAL_LIMIT");
    images.push({nodeId:node.id,path,bytes:Uint8Array.from(bytes),mimeType:b.mimeType});
    if (images.length > MAX_FILES) return fail("MANAGED_BINARY_FILE_LIMIT");
  }
  return images;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const copy=Uint8Array.from(bytes);
  const hash=await crypto.subtle.digest("SHA-256",copy.buffer);
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
}

export type ManagedBinaryStagingResult = Readonly<{
  revision: ManagedBinaryRevision;
  /** Assets successfully staged but NOT committed; caller must journal/GC them. */
  newlyStored: readonly ServerVerifiedBinaryAsset[];
}>;

/**
 * Returns a candidate revision, not a committed source. Upload port MUST be
 * separate from the existing ready-state gallery catalog. This service never
 * updates the source, index, current version, media gallery or preview.
 */
export async function stageCanonicalFullIDEImages(input: Readonly<{
  scope: ManagedBinaryScope;
  previous: ManagedBinaryRevision;
  baseVersion: number;
  nodes: readonly NativeBinaryNode[];
  upload: PrivateStagingUpload;
  /** Called immediately for every newly staged R2 object, including when a subsequent stage fails. */
  journal: (asset: ServerVerifiedBinaryAsset) => Promise<void>;
}>): Promise<ManagedBinaryStagingResult> {
  const previous=validateManagedBinaryRevision(input.previous,input.scope,input.baseVersion);
  // Validate every eligible node and its bytes BEFORE any private upload.
  const files=extractImageNodes(input.nodes);
  const prior=new Map(previous.bindings.map(binding=>[binding.nodeId,binding]));
  const nextFiles: ManagedBinaryRevisionFile[]=[];
  const newlyStored: ServerVerifiedBinaryAsset[]=[];
  // Dedup is scoped to this one private project. Never reuse cross-project keys.
  const stagedByDigest=new Map<string,ServerVerifiedBinaryAsset>();
  for (const file of files) {
    const hash=await digest(file.bytes);
    const retained=prior.get(file.nodeId);
    if (retained?.sha256===hash && retained.mimeType===file.mimeType && retained.byteLength===file.bytes.length) {
      nextFiles.push({nodeId:file.nodeId,path:file.path,assetId:retained.assetId});
      continue;
    }
    const key=`${file.mimeType}:${file.bytes.length}:${hash}`;
    let staged=stagedByDigest.get(key);
    if (!staged) {
      const response=await input.upload({path:file.path,bytes:Uint8Array.from(file.bytes),mimeType:file.mimeType});
      staged=validateServerVerifiedBinaryAsset(response,input.scope);
      if (staged.sha256!==hash || staged.byteLength!==file.bytes.length || staged.mimeType!==file.mimeType)
        return fail("MANAGED_BINARY_STAGED_HASH_MISMATCH");
      // The journal must persist durable cleanup evidence. If this throws, fail closed.
      await input.journal(staged);
      newlyStored.push(staged);
      stagedByDigest.set(key,staged);
    }
    nextFiles.push({nodeId:file.nodeId,path:file.path,assetId:staged.assetId});
  }
  const revision=planNextManagedBinaryRevision({
    scope:input.scope,previous,baseVersion:input.baseVersion,nextVersion:input.baseVersion+1,
    files:nextFiles,newlyStored,
  });
  return {revision,newlyStored};
}
