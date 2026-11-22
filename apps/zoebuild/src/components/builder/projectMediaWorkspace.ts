import type { FSNode, WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { PrivateProjectImage } from "./projectMediaClient";

/**
 * ZoeBuild-only, read-only FullIDE projection of private project media.
 * This is NOT application source and must never reach source saves/build jobs.
 * FullIDE is unchanged: it sees regular folders and binary file nodes.
 */
const PREFIX = "__zoebuild_private_media_v1__";
const FOLDER_IDS = ["public", "assets", "images"] as const;
const EMPTY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const EMPTY_PNG_BYTES = 68;
const EXTENSION: Record<PrivateProjectImage["mimeType"], string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif",
};

export type ProjectMediaBinary = Readonly<{
  encoding: "base64";
  data: string;
  sizeBytes: number;
  mimeType: string;
}>;

export type ProjectMediaProjection = Readonly<{
  workspace: WorkspaceStateV2;
  virtualNodeIds: ReadonlySet<string>;
  assetByNodeId: ReadonlyMap<string, PrivateProjectImage>;
}>;

export function projectMediaNodeId(assetId: string): string {
  if (!/^asset_[a-f0-9]{32}$/.test(assetId)) throw new Error("INVALID_PROJECT_MEDIA_ASSET_ID");
  return `${PREFIX}asset_${assetId}`;
}

function folderId(name: (typeof FOLDER_IDS)[number]): string {
  return `${PREFIX}folder_${name}`;
}

function findFolder(nodes: readonly FSNode[], parentId: string | null, name: string) {
  const matches = nodes.filter(node => node.parentId === parentId && node.name === name);
  if (matches.length > 1 || matches.some(node => node.kind !== "folder")) {
    throw new Error("PROJECT_MEDIA_FOLDER_CONFLICT");
  }
  return matches[0];
}

function requireCleanNamespace(source: WorkspaceStateV2) {
  if (source.nodes.some(node => node.id.startsWith(PREFIX))) {
    throw new Error("PROJECT_MEDIA_RESERVED_SOURCE_NODE");
  }
}

function ensureFolder(
  nodes: FSNode[],
  virtualIds: Set<string>,
  parentId: string | null,
  name: (typeof FOLDER_IDS)[number],
  timestamp: number,
): string {
  const existing = findFolder(nodes, parentId, name);
  if (existing) return existing.id;
  const id = folderId(name);
  if (nodes.some(node => node.id === id)) throw new Error("PROJECT_MEDIA_ID_COLLISION");
  nodes.push({id, kind:"folder", name, parentId, createdAt:timestamp, updatedAt:timestamp});
  virtualIds.add(id);
  return id;
}

function compareBinary(a: unknown, b: ProjectMediaBinary): boolean {
  if (!a || typeof a !== "object") return false;
  const x = a as Partial<ProjectMediaBinary>;
  return x.encoding === b.encoding && x.data === b.data &&
    x.sizeBytes === b.sizeBytes && x.mimeType === b.mimeType;
}

export function projectPrivateMediaIntoFullIDE(args: Readonly<{
  source: WorkspaceStateV2;
  images: readonly PrivateProjectImage[];
  loaded: ReadonlyMap<string, ProjectMediaBinary>;
  selectedAssetId?: string | null;
}>): ProjectMediaProjection {
  const {source, images, loaded, selectedAssetId} = args;
  requireCleanNamespace(source);
  if (images.length > 1000) throw new Error("PROJECT_MEDIA_TOO_MANY_ASSETS");
  // No private assets: do not synthesize empty folders into another project.
  // Actual source folders remain exactly as authored by the user.
  if (images.length === 0) {
    return {
      workspace: source,
      virtualNodeIds: new Set<string>(),
      assetByNodeId: new Map<string, PrivateProjectImage>(),
    };
  }
  const nodes = [...source.nodes];
  const ids = new Set(nodes.map(node => node.id));
  const virtualIds = new Set<string>();
  const assetByNodeId = new Map<string, PrivateProjectImage>();
  const stamp = 0; // stable across refetches; timestamps never create source edits
  let parentId: string | null = null;
  for (const name of FOLDER_IDS) {
    parentId = ensureFolder(nodes, virtualIds, parentId, name, stamp);
  }
  const mediaFolderId = parentId;
  const seenAssetIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const asset of images) {
    if (asset.kind !== "image" || !Object.prototype.hasOwnProperty.call(EXTENSION, asset.mimeType)) {
      throw new Error("PROJECT_MEDIA_UNSUPPORTED_ASSET");
    }
    if (seenAssetIds.has(asset.id)) throw new Error("PROJECT_MEDIA_DUPLICATE_ASSET");
    seenAssetIds.add(asset.id);
    const id = projectMediaNodeId(asset.id);
    if (ids.has(id)) throw new Error("PROJECT_MEDIA_ID_COLLISION");
    const name = `${asset.id}.${EXTENSION[asset.mimeType]}`;
    if (seenNames.has(name)) throw new Error("PROJECT_MEDIA_NAME_COLLISION");
    seenNames.add(name);
    // Don't shadow a physical application source file with a private object.
    const collisions = nodes.filter(node => node.parentId === mediaFolderId && node.name === name);
    if (collisions.length) throw new Error("PROJECT_MEDIA_SOURCE_NAME_COLLISION");
    const binary = loaded.get(asset.id) ?? {
      encoding: "base64" as const,
      data: EMPTY_PNG_BASE64,
      sizeBytes: EMPTY_PNG_BYTES,
      mimeType: "image/png",
    };
    if (binary.encoding !== "base64" || binary.sizeBytes < 1 || binary.sizeBytes > 20 * 1024 * 1024 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(binary.data)) {
      throw new Error("PROJECT_MEDIA_BINARY_INVALID");
    }
    nodes.push({
      id, kind:"file", name, parentId:mediaFolderId, content:"",
      binary, createdAt:stamp, updatedAt:stamp,
    });
    ids.add(id);
    virtualIds.add(id);
    assetByNodeId.set(id, asset);
  }

  const selectedId = selectedAssetId && seenAssetIds.has(selectedAssetId)
    ? projectMediaNodeId(selectedAssetId) : null;
  const activeFileId = selectedId ?? source.activeFileId;
  const openTabs = selectedId && !source.openTabs.includes(selectedId)
    ? [...source.openTabs, selectedId] : source.openTabs;
  const expanded = [...new Set([...source.expanded, ...FOLDER_IDS.map(folderId).filter(id=>virtualIds.has(id))])];
  return {
    workspace: {...source, nodes, activeFileId, openTabs, expanded},
    virtualNodeIds: virtualIds,
    assetByNodeId,
  };
}

export function removePrivateMediaProjection(
  displayed: WorkspaceStateV2,
  projection: ProjectMediaProjection,
  previousSource: WorkspaceStateV2,
): WorkspaceStateV2 {
  const keep = (id: string) => !projection.virtualNodeIds.has(id);
  const nodes = displayed.nodes.filter(node => keep(node.id));
  // Never permit source nodes to depend on virtual folder parents.
  if (nodes.some(node => node.parentId && projection.virtualNodeIds.has(node.parentId))) {
    throw new Error("PROJECT_MEDIA_READ_ONLY_FOLDER");
  }
  const activeFileId = keep(displayed.activeFileId)
    ? displayed.activeFileId : previousSource.activeFileId;
  return {
    ...displayed,
    nodes,
    activeFileId,
    openTabs: displayed.openTabs.filter(keep),
    expanded: displayed.expanded.filter(keep),
    entryFileId: keep(displayed.entryFileId)
      ? displayed.entryFileId : previousSource.entryFileId,
  };
}

export function privateMediaProjectionIsIntact(
  displayed: WorkspaceStateV2, projection: ProjectMediaProjection,
): boolean {
  // An empty project has no virtual folders to protect.
  if (projection.virtualNodeIds.size === 0) return true;
  const actual = new Map(displayed.nodes.map(node => [node.id, node]));
  // Real source folders reused as virtual ancestors must also remain in place.
  // Otherwise deleting public/ could silently orphan cloud-backed Explorer files.
  let displayedParent: string | null = null;
  let expectedParent: string | null = null;
  for (const folderName of FOLDER_IDS) {
    const displayedFolder = displayed.nodes.filter(n => n.kind === "folder" &&
      n.parentId === displayedParent && n.name === folderName);
    const expectedFolder = projection.workspace.nodes.filter(n => n.kind === "folder" &&
      n.parentId === expectedParent && n.name === folderName);
    if (displayedFolder.length !== 1 || expectedFolder.length !== 1 ||
        displayedFolder[0].id !== expectedFolder[0].id) return false;
    displayedParent = displayedFolder[0].id;
    expectedParent = expectedFolder[0].id;
  }
  for (const expected of projection.workspace.nodes) {
    if (!projection.virtualNodeIds.has(expected.id)) continue;
    const node = actual.get(expected.id);
    if (!node || node.kind !== expected.kind || node.parentId !== expected.parentId ||
        node.name !== expected.name ||
        (node.kind === "file" && (expected.kind !== "file" || !compareBinary(node.binary, expected.binary as ProjectMediaBinary)))) {
      return false;
    }
  }
  return true;
}
