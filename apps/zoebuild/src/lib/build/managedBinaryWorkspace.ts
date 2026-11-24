/**
 * AI4B4E2B1: private, server-side boundary between canonical inline FullIDE
 * workspaces and R2-backed versioned source snapshots.
 *
 * This module is deliberately NOT wired to save, preview or publication yet.
 * A future commit port MUST persist BOTH the snapshot and its revision manifest
 * in one owner-scoped compare-and-swap database transaction, and then use
 * hydrateManagedBinaryWorkspace for every consumer that needs binary bytes.
 * Never pass a stripped snapshot alone to FullIDE or the Runner.
 */
import {
  ManagedBinaryRevisionError,
  readVerifiedManagedBinary,
  validateManagedBinaryRevision,
  type ManagedBinaryRevision,
  type ManagedBinaryScope,
} from "./managedBinaryRevision";

type Binary = Readonly<{
  encoding: string;
  data: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
}>;

export type ManagedWorkspaceNode = Readonly<{
  id: string;
  kind: "folder" | "file";
  name: string;
  parentId: string | null;
  content?: string;
  binary?: Binary;
}>;

export type ManagedWorkspace = Readonly<{
  nodes: readonly ManagedWorkspaceNode[];
}>;

/** An explicit envelope prevents a stripped snapshot from masquerading as FullIDE state. */
export type ManagedBinaryStoredSnapshot<W extends ManagedWorkspace> = Readonly<{
  format: "zoebuild-r2-binary-snapshot-v1";
  sourceVersion: number;
  workspace: W;
}>;

const MAX_BINARY_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BINARY_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_FILES = 150;
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function fail(code: string): never {
  throw new ManagedBinaryRevisionError(code);
}

function exactPathMap(nodes: readonly ManagedWorkspaceNode[]): Map<string, string> {
  if (!Array.isArray(nodes) || nodes.length > 500) fail("MANAGED_WORKSPACE_INVALID");
  const byId = new Map<string, ManagedWorkspaceNode>();
  const siblings = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || !node.id || byId.has(node.id) ||
        (node.kind !== "file" && node.kind !== "folder") ||
        typeof node.name !== "string" || !node.name || node.name.trim() !== node.name ||
        node.name === "." || node.name === ".." || node.name.includes("/") ||
        node.name.includes("\\") || node.name.includes("\0") ||
        (node.parentId !== null && typeof node.parentId !== "string")) {
      fail("MANAGED_WORKSPACE_NODE_INVALID");
    }
    const sibling = `${node.parentId ?? "<root>"}\u001f${node.name.toLocaleLowerCase("en-US")}`;
    if (siblings.has(sibling)) fail("MANAGED_WORKSPACE_SIBLING_CONFLICT");
    siblings.add(sibling);
    byId.set(node.id, node);
  }
  const pathById = new Map<string, string>();
  const visiting = new Set<string>();
  function visit(id: string): string {
    const cached = pathById.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) fail("MANAGED_WORKSPACE_PARENT_CYCLE");
    const node = byId.get(id);
    if (!node) fail("MANAGED_WORKSPACE_PARENT_MISSING");
    visiting.add(id);
    const parent = node.parentId === null ? "" : (() => {
      const upper = byId.get(node.parentId!);
      if (!upper || upper.kind !== "folder") fail("MANAGED_WORKSPACE_PARENT_INVALID");
      return `${visit(upper.id)}/`;
    })();
    visiting.delete(id);
    const path = parent + node.name;
    pathById.set(id, path);
    return path;
  }
  for (const id of byId.keys()) visit(id);
  return pathById;
}

function assertManifestMatchesWorkspace<W extends ManagedWorkspace>(
  workspace: W,
  revision: ManagedBinaryRevision,
  expectInline: boolean,
): Map<string, string> {
  const paths = exactPathMap(workspace.nodes);
  const byId = new Map(workspace.nodes.map(node => [node.id, node]));
  const managed = new Set<string>();
  for (const binding of revision.bindings) {
    const node = byId.get(binding.nodeId);
    if (!node || node.kind !== "file" || paths.get(binding.nodeId) !== binding.path) {
      fail("MANAGED_WORKSPACE_BINDING_MISMATCH");
    }
    if (node.content !== "") fail("MANAGED_WORKSPACE_MANAGED_CONTENT_INVALID");
    if (expectInline && !node.binary) fail("MANAGED_WORKSPACE_INLINE_BYTES_MISSING");
    if (!expectInline && node.binary !== undefined) fail("MANAGED_WORKSPACE_STRIPPED_BYTES_PRESENT");
    managed.add(binding.nodeId);
  }
  // A private managed image must never evade the manifest. Other binary types
  // deliberately retain the legacy inline storage until separately supported.
  for (const node of workspace.nodes) {
    if (node.kind === "file" && node.binary && IMAGE_MIME.has(node.binary.mimeType) &&
        !managed.has(node.id)) {
      fail("MANAGED_WORKSPACE_UNBOUND_IMAGE");
    }
  }
  return paths;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

function decodeInline(binary: Binary, mimeType: string, byteLength: number): Uint8Array {
  if (binary.encoding !== "base64" || binary.mimeType !== mimeType ||
      !Number.isSafeInteger(binary.sizeBytes) || binary.sizeBytes !== byteLength ||
      byteLength <= 0 || byteLength > MAX_BINARY_BYTES ||
      !BASE64.test(binary.data) || !binary.data) {
    fail("MANAGED_WORKSPACE_INLINE_INVALID");
  }
  const bytes = Buffer.from(binary.data, "base64");
  if (bytes.length !== byteLength || bytes.toString("base64") !== binary.data) {
    fail("MANAGED_WORKSPACE_INLINE_INVALID");
  }
  return bytes;
}

/**
 * Validate all canonical inline image bytes BEFORE proposing a stripped source.
 * The immutable revision metadata stays in a trusted, separate DB record.
 */
export async function stripVerifiedManagedBinaryWorkspace<W extends ManagedWorkspace>(input: Readonly<{
  scope: ManagedBinaryScope;
  revision: ManagedBinaryRevision;
  sourceVersion: number;
  workspace: W;
}>): Promise<ManagedBinaryStoredSnapshot<W>> {
  const revision = validateManagedBinaryRevision(input.revision, input.scope, input.sourceVersion);
  assertManifestMatchesWorkspace(input.workspace, revision, true);
  const byId = new Map(input.workspace.nodes.map(node => [node.id, node]));
  let totalBytes = 0;
  for (const binding of revision.bindings) {
    const node = byId.get(binding.nodeId)!;
    const bytes = decodeInline(node.binary!, binding.mimeType, binding.byteLength);
    if (await sha256(bytes) !== binding.sha256) fail("MANAGED_WORKSPACE_INLINE_HASH_MISMATCH");
    if (node.binary!.checksum && node.binary!.checksum !== `sha256:${binding.sha256}`) {
      fail("MANAGED_WORKSPACE_INLINE_CHECKSUM_INVALID");
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BINARY_BYTES) fail("MANAGED_WORKSPACE_TOTAL_LIMIT");
  }
  const boundIds = new Set(revision.bindings.map(binding => binding.nodeId));
  const nodes = input.workspace.nodes.map(node => {
    if (!boundIds.has(node.id)) return { ...node };
    const {binary: _removedBinary, ...withoutBinary} = node;
    void _removedBinary;
    return withoutBinary;
  });
  const stripped = { ...input.workspace, nodes } as unknown as W;
  assertManifestMatchesWorkspace(stripped, revision, false);
  return {format:"zoebuild-r2-binary-snapshot-v1", sourceVersion: input.sourceVersion, workspace:stripped};
}

/**
 * Recreate the legacy canonical FullIDE workspace in memory, without changing
 * the stored snapshot. R2 keys never enter the returned workspace. Fails closed
 * before any bytes are returned to a caller if a binding or R2 object is bad.
 */
export async function hydrateVerifiedManagedBinaryWorkspace<W extends ManagedWorkspace>(input: Readonly<{
  scope: ManagedBinaryScope;
  revision: ManagedBinaryRevision;
  sourceVersion: number;
  stored: ManagedBinaryStoredSnapshot<W>;
  readObject: (objectKey: string) => Promise<Uint8Array | null>;
}>): Promise<W> {
  const revision = validateManagedBinaryRevision(input.revision, input.scope, input.sourceVersion);
  if (input.stored?.format !== "zoebuild-r2-binary-snapshot-v1" ||
      input.stored.sourceVersion !== input.sourceVersion || !input.stored.workspace) {
    fail("MANAGED_WORKSPACE_SNAPSHOT_VERSION_MISMATCH");
  }
  assertManifestMatchesWorkspace(input.stored.workspace, revision, false);
  if (revision.bindings.length > MAX_IMAGE_FILES) fail("MANAGED_WORKSPACE_IMAGE_LIMIT");
  let totalBytes = 0;
  // Read only the manifest-pinned object keys. Each read independently checks
  // declared length and SHA-256. Keep all reads scoped to the supplied revision.
  const loaded = new Map<string, Binary>();
  for (const binding of revision.bindings) {
    if (binding.byteLength > MAX_BINARY_BYTES) fail("MANAGED_WORKSPACE_FILE_LIMIT");
    totalBytes += binding.byteLength;
    if (totalBytes > MAX_TOTAL_BINARY_BYTES) fail("MANAGED_WORKSPACE_TOTAL_LIMIT");
    const bytes = await readVerifiedManagedBinary({
      scope: input.scope, revision, sourceVersion: input.sourceVersion,
      nodeId: binding.nodeId, readObject: input.readObject,
    });
    loaded.set(binding.nodeId, {
      encoding:"base64", data:Buffer.from(bytes).toString("base64"),
      mimeType:binding.mimeType,sizeBytes:binding.byteLength,
      checksum:`sha256:${binding.sha256}`,
    });
  }
  const nodes = input.stored.workspace.nodes.map(node => {
    const binary = loaded.get(node.id);
    return binary ? {...node,binary} : {...node};
  });
  const hydrated = {...input.stored.workspace,nodes} as unknown as W;
  assertManifestMatchesWorkspace(hydrated, revision, true);
  return hydrated;
}
