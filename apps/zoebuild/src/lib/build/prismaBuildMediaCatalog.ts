import "server-only";
import {prisma} from "@zoeskoul/platform-server/prisma";
import {createDurableBuildMediaCatalog, type DurableMediaCatalogPort,
  type MediaCatalogRecord} from "@zoeskoul/build-application";

/** Server-only Prisma persistence for AI4B1 media orchestration. No user-controlled access. */
export function createPrismaBuildMediaCatalog() {
  const port:DurableMediaCatalogPort={
    async lookupProjectOwner(id) {
      const p=await prisma.buildProject.findUnique({
        where:{id},select:{codeProject:{select:{ownerId:true,archivedAt:true}}},
      });
      return p?.codeProject ?? null;
    },
    async findScoped(scope, assetId) {
      return prisma.buildMediaAsset.findFirst({where:{
        id:assetId,buildProjectId:scope.buildProjectId,ownerId:scope.ownerId,
      }});
    },
    async createImmutable(row:MediaCatalogRecord) {
      try {
        await prisma.buildMediaAsset.create({data:{...row}});
        return "created";
      } catch(error) {
        // Prisma P2002: unique asset ID or object key exists. Re-read and compare.
        if(error && typeof error==="object" && "code" in error && error.code==="P2002")
          return "conflict";
        throw error;
      }
    },
    async findById(assetId) {
      return prisma.buildMediaAsset.findUnique({where:{id:assetId}});
    },
  };
  return createDurableBuildMediaCatalog(port);
}
