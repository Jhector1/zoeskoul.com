import {DevelopmentPreviewBodyError} from "./reactPreviewDevelopmentHttp";

const TOKEN=/^dpg1\.[A-Za-z0-9_-]{43}$/;
/** Fail closed on oversized, malformed and extra-field browser submissions. */
export async function readDevelopmentPreviewGrantRenewal(request:Request):Promise<{
  sourceVersion:number;grantToken:string;
}> {
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test((request.headers.get("content-type")??"").trim()))
   throw new DevelopmentPreviewBodyError(400);
 const length=request.headers.get("content-length");
 if(length && (!/^\d+$/.test(length)||Number(length)>4096))throw new DevelopmentPreviewBodyError(413);
 if(!request.body)throw new DevelopmentPreviewBodyError(400);
 const reader=request.body.getReader(); const chunks:Uint8Array[]=[];let size=0;
 try {
  while(true){const part=await reader.read();if(part.done)break;
   size+=part.value.byteLength;if(size>4096)throw new DevelopmentPreviewBodyError(413);
   chunks.push(part.value);
  }
 } finally {await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 try {
  const buffer=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
  const data:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buffer));
  if(!data||typeof data!=="object"||Array.isArray(data))throw 0;
  const row=data as Record<string,unknown>;
  if(Object.keys(row).length!==2 || !Object.hasOwn(row,"sourceVersion") ||
     !Object.hasOwn(row,"grantToken") || typeof row.sourceVersion!=="number" ||
     !Number.isSafeInteger(row.sourceVersion) || row.sourceVersion<1 ||
     typeof row.grantToken!=="string"||!TOKEN.test(row.grantToken))throw 0;
  return {sourceVersion:row.sourceVersion,grantToken:row.grantToken};
 } catch {throw new DevelopmentPreviewBodyError(400);}
}
