/** AI4B4B: strict, untrusted JSON decoder for owner-authorized media API results. */
export type PrivateProjectImage = Readonly<{
  id:string;
  kind:"image";
  origin:"uploaded"|"generated";
  mimeType:"image/png"|"image/jpeg"|"image/webp"|"image/avif";
  width:number|null;
  height:number|null;
  byteLength:number;
  altText:string|null;
  previewPath:string;
}>;

export type PrivateProjectImagePage = Readonly<{
  items:readonly PrivateProjectImage[];
  nextCursor:string|null;
}>;
const MAX_IMAGE_BYTES=20*1024*1024;
const ASSET_ID=/^[A-Za-z0-9_-]{10,128}$/;
const VALID_MIMES=new Set(["image/png","image/jpeg","image/webp","image/avif"]);

export function privateMediaPath(buildProjectId:string,assetId?:string):string {
  if(!buildProjectId || !/^[A-Za-z0-9_-]{4,128}$/.test(buildProjectId))
    throw new Error("INVALID_MEDIA_PROJECT_ID");
  const base=`/api/build/projects/${encodeURIComponent(buildProjectId)}/media`;
  if(assetId===undefined)return base;
  if(!ASSET_ID.test(assetId))throw new Error("INVALID_MEDIA_ASSET_ID");
  return `${base}/${encodeURIComponent(assetId)}`;
}

export function readPrivateMediaPage(value:unknown,buildProjectId:string):PrivateProjectImagePage {
  if(!value || typeof value!=="object" || Array.isArray(value))throw Error("INVALID_MEDIA_RESPONSE");
  const data=value as Record<string,unknown>;
  if(data.ok!==true || !Array.isArray(data.items) || data.items.length>40)throw Error("INVALID_MEDIA_RESPONSE");
  if(data.nextCursor!==null &&
     (typeof data.nextCursor!=="string" || !ASSET_ID.test(data.nextCursor)))
    throw Error("INVALID_MEDIA_CURSOR");
  const seen=new Set<string>();
  const items:PrivateProjectImage[]=data.items.map((item:unknown)=>{
    if(!item || typeof item!=="object" || Array.isArray(item))throw Error("INVALID_MEDIA_ITEM");
    const row=item as Record<string,unknown>;
    if(typeof row.id!=="string" || !ASSET_ID.test(row.id) || seen.has(row.id) ||
       row.kind!=="image" || !["generated","uploaded"].includes(String(row.origin)) ||
       !VALID_MIMES.has(String(row.mimeType)) ||
       !Number.isSafeInteger(row.byteLength) || (row.byteLength as number)<1 ||
       (row.byteLength as number)>MAX_IMAGE_BYTES ||
       (row.width!==null && (!Number.isSafeInteger(row.width) || (row.width as number)<1)) ||
       (row.height!==null && (!Number.isSafeInteger(row.height) || (row.height as number)<1)) ||
       (row.altText!==null && (typeof row.altText!=="string" || row.altText.length>300)) ||
       row.previewPath!==privateMediaPath(buildProjectId,row.id))
      throw Error("INVALID_MEDIA_ITEM");
    seen.add(row.id);
    return {id:row.id,kind:"image",origin:row.origin as "uploaded"|"generated",
      mimeType:row.mimeType as PrivateProjectImage["mimeType"],
      width:row.width as number|null,height:row.height as number|null,
      byteLength:row.byteLength as number,altText:row.altText as string|null,
      previewPath:row.previewPath as string};
  });
  return {items,nextCursor:data.nextCursor as string|null};
}
