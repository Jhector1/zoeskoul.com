import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import type {PrivateProjectImage} from "./projectMediaClient";

/**
 * Explicit owner-initiated copy from the private media gallery to public app
 * source. Private gallery virtual nodes and private object keys never enter
 * the canonical workspace. The ordinary versioned source-save is still required.
 */
export const MAX_APPLICATION_IMAGE_BYTES = 5 * 1024 * 1024;
const APPLICATION_ID_PREFIX = "zoebuild_app_media_";

function reject(message: string): never { throw new Error(message); }

function pathForFile(source: WorkspaceStateV2, fileId: string): string {
  const byId = new Map(source.nodes.map(node => [node.id,node]));
  let node = byId.get(fileId);
  const parts: string[] = [];
  const visited = new Set<string>();
  while (node) {
    if (visited.has(node.id) || !node.name || node.name.includes("/") || node.name.includes("\\"))
      return reject("Invalid image workspace path.");
    visited.add(node.id);
    parts.unshift(node.name);
    if (node.parentId === null) break;
    node = byId.get(node.parentId);
    if (!node) return reject("Missing image parent folder.");
  }
  return parts.join("/");
}

export function copyPrivatePngIntoApplication(args: Readonly<{
  source: WorkspaceStateV2;
  asset: PrivateProjectImage;
  base64: string;
  checksum: string;
  replaceSelected?: boolean;
  timestamp: number;
  newFolderId: () => string;
}>): WorkspaceStateV2 {
  const {source,asset,base64,checksum,timestamp,newFolderId} = args;
  if (asset.mimeType !== "image/png" || asset.byteLength < 1 ||
      asset.byteLength > MAX_APPLICATION_IMAGE_BYTES ||
      !/^asset_[a-f0-9]{32}$/.test(asset.id) ||
      !/^sha256:[0-9a-f]{64}$/.test(checksum) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64) ||
      base64.length !== 4 * Math.ceil(asset.byteLength / 3)) {
    return reject("Only verified PNG images up to 5 MB can be added to application source.");
  }
  if (source.nodes.length > 495) return reject("Project file limit reached.");
  const nodes = [...source.nodes];
  const ids = new Set(nodes.map(node => node.id));
  const fileId = APPLICATION_ID_PREFIX + asset.id;
  const filename = `${asset.id}.png`;
  const binary = {encoding:"base64" as const,data:base64,mimeType:"image/png" as const,
    sizeBytes:asset.byteLength,checksum};
  let target = args.replaceSelected
    ? nodes.find(node => node.id === source.activeFileId)
    : nodes.find(node => node.id === fileId);
  if (args.replaceSelected) {
    if (!target || target.kind !== "file" || target.binary?.mimeType !== "image/png" ||
        !/^public\/.+\.png$/.test(pathForFile(source,target.id)))
      return reject("Select an existing public PNG file in Code before replacing it.");
  }
  if (target) {
    if (target.kind !== "file" || target.binary?.mimeType !== "image/png" ||
        !/^public\/.+\.png$/.test(pathForFile(source,target.id)))
      return reject("An existing application node conflicts with this image.");
    nodes[nodes.indexOf(target)] = {...target,content:"",binary,updatedAt:timestamp};
  } else {
    function folder(parentId:string|null,name:string):string {
      const existing = nodes.filter(node => node.parentId === parentId && node.name.toLowerCase() === name.toLowerCase());
      if (existing.length > 1 || (existing.length === 1 && (existing[0].kind !== "folder" || existing[0].name !== name)))
        return reject("Application asset folder conflicts with an existing file.");
      if (existing.length === 1) return existing[0].id;
      const id = newFolderId();
      if (!id || ids.has(id) || id.startsWith("__zoebuild_private_media_v1__"))
        return reject("Invalid application folder identity.");
      ids.add(id);
      nodes.push({id,kind:"folder",name,parentId,createdAt:timestamp,updatedAt:timestamp});
      return id;
    }
    const publicId = folder(null,"public");
    const imagesId = folder(publicId,"images");
    if (nodes.some(node => node.parentId === imagesId && node.name.toLowerCase() === filename.toLowerCase()) || ids.has(fileId))
      return reject("Application image path is already occupied.");
    nodes.push({id:fileId,kind:"file",name:filename,parentId:imagesId,content:"",binary,
      createdAt:timestamp,updatedAt:timestamp});
  }
  const activeFileId = target?.id ?? fileId;
  const openTabs = source.openTabs.includes(activeFileId)
    ? source.openTabs : [...source.openTabs,activeFileId];
  return {...source,nodes,activeFileId,openTabs};
}
