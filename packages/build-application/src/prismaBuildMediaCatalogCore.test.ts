import {describe,it,expect} from "vitest";
import {buildMediaObjectKey,parseBuildMediaAsset} from "@zoeskoul/build-contracts";
import {createDurableBuildMediaCatalog,type DurableMediaCatalogPort,type MediaCatalogRecord} from "./prismaBuildMediaCatalogCore";

const scope={ownerId:"owner-abcde",buildProjectId:"project-abcdef"};
const id="asset-1234567890";
const sha="a".repeat(64);
const asset=parseBuildMediaAsset({id,scope,kind:"image",origin:"generated",
  visibility:"private",state:"ready",sha256:sha,
  objectKey:buildMediaObjectKey(scope,id,sha),mimeType:"image/png",byteLength:100,
  width:20,height:20,durationMs:null,altText:null,providerId:"fal",modelId:"flux.1"},scope);
function fixture(owner=scope.ownerId,archivedAt:Date|null=null){
 const rows=new Map<string,MediaCatalogRecord>();
 const port:DurableMediaCatalogPort={
   lookupProjectOwner:async()=>({ownerId:owner,archivedAt}),
   findScoped:async(s,k)=>{const v=rows.get(k);return v?.buildProjectId===s.buildProjectId&&v.ownerId===s.ownerId?v:null},
   createImmutable:async(row)=>{if(rows.has(row.id))return "conflict";rows.set(row.id,row);return "created"},
   findById:async(k)=>rows.get(k)??null,
   listScoped:async(s,cursor,take)=>{
     const matches=[...rows.values()].filter(r=>r.ownerId===s.ownerId && r.buildProjectId===s.buildProjectId);
     const start=cursor ? matches.findIndex(r=>r.id===cursor)+1 : 0;
     return matches.slice(start,start+take);
   },
 };
 return {rows,...createDurableBuildMediaCatalog(port)};
}
describe("AI4B3A durable media catalog boundary",()=>{
 it("exposes only the active project's owner",async()=>{
  expect(await fixture().ownership.getActiveProjectOwnerId(scope.buildProjectId)).toBe(scope.ownerId);
  expect(await fixture(scope.ownerId,new Date()).ownership.getActiveProjectOwnerId(scope.buildProjectId)).toBeNull();
 });
 it("stores and reads an immutable scoped image",async()=>{
  const f=fixture();expect(await f.catalog.insertIfAbsent(asset)).toEqual(asset);
  expect(await f.catalog.find(scope,id)).toEqual(asset);
  expect(await f.catalog.insertIfAbsent(asset)).toEqual(asset);
 });
 it("refuses wrong owner, even for known identifiers",async()=>{
  const f=fixture("other-owner");
  await expect(f.catalog.insertIfAbsent(asset)).rejects.toThrow("BUILD_MEDIA_ACCESS_DENIED");
  await expect(f.catalog.find(scope,id)).rejects.toThrow("BUILD_MEDIA_ACCESS_DENIED");
 });
 it("refuses archived projects",async()=>{
  const f=fixture(scope.ownerId,new Date());
  await expect(f.catalog.insertIfAbsent(asset)).rejects.toThrow("BUILD_MEDIA_ACCESS_DENIED");
 });
 it("refuses conflicting byte digests and cross-project collisions",async()=>{
  const f=fixture();await f.catalog.insertIfAbsent(asset);
  const differing=parseBuildMediaAsset({...asset,sha256:"b".repeat(64),
    objectKey:buildMediaObjectKey(scope,id,"b".repeat(64))},scope);
  await expect(f.catalog.insertIfAbsent(differing)).rejects.toThrow("BUILD_MEDIA_IMMUTABLE_CONFLICT");
  expect(f.rows.get(id)?.sha256).toBe(sha);
 });
 it("does not expose rows scoped to another owner",async()=>{
  const f=fixture();await f.catalog.insertIfAbsent(asset);
  const other={ownerId:"owner-other",buildProjectId:scope.buildProjectId};
  await expect(f.catalog.find(other,id)).rejects.toThrow("BUILD_MEDIA_ACCESS_DENIED");
 });
 it("lists scoped assets without leaking storage keys across project boundaries",async()=>{
  const f=fixture();await f.catalog.insertIfAbsent(asset);
  const page=await f.list(scope,null);
  expect(page.items).toEqual([asset]);expect(page.nextCursor).toBeNull();
  expect(await f.list(scope,id)).toEqual({items:[],nextCursor:null});
  await expect(f.list(scope,"missing-asset-123")).rejects.toThrow("BUILD_MEDIA_CURSOR_INVALID");
 });
 it("lists are inaccessible to another owner or archived projects",async()=>{
  await expect(fixture("different-owner").list(scope,null)).rejects.toThrow("BUILD_MEDIA_ACCESS_DENIED");
  await expect(fixture(scope.ownerId,new Date()).list(scope,null)).rejects.toThrow("BUILD_MEDIA_ACCESS_DENIED");
 });
 it("does not trust a DB conflict result without a verified row",async()=>{
  const f=fixture();f.rows.set(id,{id,buildProjectId:"project-other",ownerId:"owner-other",
    objectKey:asset.objectKey,sha256:sha,kind:"image",origin:"generated",visibility:"private",
    state:"ready",mimeType:"image/png",byteLength:100,width:20,height:20,durationMs:null,
    altText:null,providerId:"fal",modelId:"flux.1"});
  await expect(f.catalog.insertIfAbsent(asset)).rejects.toThrow("BUILD_MEDIA_IMMUTABLE_CONFLICT");
 });
});
