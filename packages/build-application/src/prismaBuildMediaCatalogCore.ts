/** AI4B3A: transactional catalog rules; database and authentication stay server-side. */
import {parseBuildMediaAsset, parseBuildMediaScope, type BuildMediaAsset,
  type BuildMediaProjectScope} from "@zoeskoul/build-contracts";
import {BuildMediaStorageError, type BuildMediaMetadataRepository,
  type BuildMediaOwnershipReader} from "./projectMediaStorage";

export type MediaCatalogRecord = Readonly<{
  id: string; buildProjectId: string; ownerId: string; objectKey: string;
  sha256: string; kind: string; origin: string; visibility: string; state: string;
  mimeType: string; byteLength: number; width: number|null; height: number|null;
  durationMs: number|null; altText: string|null; providerId: string|null; modelId: string|null;
}>;

/** Storage adapter must use a unique asset ID and immutable create (not upsert-update). */
export interface DurableMediaCatalogPort {
  lookupProjectOwner(buildProjectId: string): Promise<Readonly<{ownerId:string;archivedAt:Date|null}>|null>;
  findScoped(scope:BuildMediaProjectScope, assetId:string):Promise<MediaCatalogRecord|null>;
  createImmutable(row:MediaCatalogRecord): Promise<"created"|"conflict">;
  findById(assetId:string):Promise<MediaCatalogRecord|null>;
}

export function createDurableBuildMediaCatalog(port:DurableMediaCatalogPort): Readonly<{
  ownership: BuildMediaOwnershipReader; catalog: BuildMediaMetadataRepository;
}> {
  async function validOwner(scope:BuildMediaProjectScope):Promise<void> {
    const project=await port.lookupProjectOwner(scope.buildProjectId);
    if(!project || project.archivedAt!==null || project.ownerId!==scope.ownerId)
      throw new BuildMediaStorageError("BUILD_MEDIA_ACCESS_DENIED");
  }
  function fromRow(row:MediaCatalogRecord, scope:BuildMediaProjectScope):BuildMediaAsset {
    return parseBuildMediaAsset({
      id:row.id,scope:{buildProjectId:row.buildProjectId,ownerId:row.ownerId},
      objectKey:row.objectKey,sha256:row.sha256,kind:row.kind,origin:row.origin,
      visibility:row.visibility,state:row.state,mimeType:row.mimeType,
      byteLength:row.byteLength,width:row.width,height:row.height,
      durationMs:row.durationMs,altText:row.altText,providerId:row.providerId,modelId:row.modelId,
    },scope);
  }
  function same(a:BuildMediaAsset,b:BuildMediaAsset):boolean {
    return a.id===b.id && a.objectKey===b.objectKey && a.sha256===b.sha256 &&
      a.mimeType===b.mimeType && a.byteLength===b.byteLength && a.kind===b.kind &&
      a.origin===b.origin && a.visibility===b.visibility && a.state===b.state &&
      a.width===b.width && a.height===b.height && a.durationMs===b.durationMs &&
      a.altText===b.altText && a.providerId===b.providerId && a.modelId===b.modelId;
  }
  return {
    ownership: {
      async getActiveProjectOwnerId(id) {
        // Fail closed on missing/archived projects, no grants inferred.
        const project=await port.lookupProjectOwner(id);
        return project && project.archivedAt===null ? project.ownerId : null;
      },
    },
    catalog: {
      async find(scope,assetId) {
        const trusted=parseBuildMediaScope(scope);
        await validOwner(trusted);
        const row=await port.findScoped(trusted,assetId);
        return row ? fromRow(row,trusted) : null;
      },
      async insertIfAbsent(asset) {
        const trusted=parseBuildMediaScope(asset.scope);
        const safe=parseBuildMediaAsset(asset,trusted);
        await validOwner(trusted);
        const row:MediaCatalogRecord={
          id:safe.id,buildProjectId:trusted.buildProjectId,ownerId:trusted.ownerId,
          objectKey:safe.objectKey,sha256:safe.sha256,kind:safe.kind,origin:safe.origin,
          visibility:safe.visibility,state:safe.state,mimeType:safe.mimeType,
          byteLength:safe.byteLength,width:safe.width,height:safe.height,
          durationMs:safe.durationMs,altText:safe.altText,providerId:safe.providerId,modelId:safe.modelId,
        };
        const status=await port.createImmutable(row);
        if(status!=="created"&&status!=="conflict")
          throw new BuildMediaStorageError("BUILD_MEDIA_CATALOG_RESULT_INVALID");
        // Always re-read authoritative row; a conflicting ID cannot return another owner's metadata.
        const committed=await port.findById(safe.id);
        if(!committed || committed.ownerId!==trusted.ownerId ||
            committed.buildProjectId!==trusted.buildProjectId)
          throw new BuildMediaStorageError("BUILD_MEDIA_IMMUTABLE_CONFLICT");
        const checked=fromRow(committed,trusted);
        if(!same(safe,checked))throw new BuildMediaStorageError("BUILD_MEDIA_IMMUTABLE_CONFLICT");
        return checked;
      },
    },
  };
}
