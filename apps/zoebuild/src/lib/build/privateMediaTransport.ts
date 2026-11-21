/** Pure, dependency-light HTTP media transport rules. No database or credentials. */
import {BUILD_MEDIA_LIMITS} from "@zoeskoul/build-application";

export class MediaHttpError extends Error {
  constructor(readonly status:number,readonly code:string) {super(code);this.name="MediaHttpError";}
}
export function publicMediaMetadata(asset:Readonly<{
  id:string;kind:string;origin:string;mimeType:string;
  width:number|null;height:number|null;byteLength:number;altText:string|null;
}>,buildProjectId:string) {
  return {id:asset.id,kind:asset.kind,origin:asset.origin,mimeType:asset.mimeType,
    width:asset.width,height:asset.height,byteLength:asset.byteLength,
    altText:asset.altText,
    previewPath:`/api/build/projects/${encodeURIComponent(buildProjectId)}/media/${encodeURIComponent(asset.id)}`};
}
/** A declared Content-Length is only a hint; streamed bytes are bounded separately. */
export async function readPrivateMediaUpload(req:Request):Promise<Uint8Array> {
  const declared=req.headers.get("content-length");
  if(declared!==null && (!/^\d+$/.test(declared) ||
      Number(declared)>BUILD_MEDIA_LIMITS.imageBytes))
    throw new MediaHttpError(413,"BUILD_MEDIA_REQUEST_TOO_LARGE");
  if(!req.body)throw new MediaHttpError(400,"BUILD_MEDIA_UPLOAD_EMPTY");
  const reader=req.body.getReader();
  const chunks:Uint8Array[]=[];
  let size=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>BUILD_MEDIA_LIMITS.imageBytes)
        throw new MediaHttpError(413,"BUILD_MEDIA_REQUEST_TOO_LARGE");
      chunks.push(Uint8Array.from(value));
    }
  } finally {
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  if(size===0)throw new MediaHttpError(400,"BUILD_MEDIA_UPLOAD_EMPTY");
  const result=new Uint8Array(size);
  let offset=0;
  for(const part of chunks){result.set(part,offset);offset+=part.length;}
  return result;
}
