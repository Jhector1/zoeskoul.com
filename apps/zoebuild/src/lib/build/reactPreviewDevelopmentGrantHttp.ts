import {DevelopmentPreviewBodyError,readDevelopmentPreviewControlBody} from "./reactPreviewDevelopmentHttp";

const TOKEN=/^dpg1\.[A-Za-z0-9_-]{43}$/;
type UpdateBody={sourceVersion:number;grantToken?:string};
/** Update accepts only a revision and an optional opaque durable read grant.
 * No source, actor keys, deployment credentials or workspace bytes. */
export async function readDevelopmentPreviewUpdate(request:Request):Promise<UpdateBody> {
 const row=await readDevelopmentPreviewControlBody(request);
 const hasToken=Object.hasOwn(row,"grantToken");
 if(Object.keys(row).length!==(hasToken?2:1) || !Object.hasOwn(row,"sourceVersion") ||
    typeof row.sourceVersion!=="number" || !Number.isSafeInteger(row.sourceVersion) || row.sourceVersion<1)
   throw new DevelopmentPreviewBodyError(400);
 if(!hasToken)return {sourceVersion:row.sourceVersion};
 if(typeof row.grantToken!=="string" || !TOKEN.test(row.grantToken))throw new DevelopmentPreviewBodyError(400);
 return {sourceVersion:row.sourceVersion,grantToken:row.grantToken};
}
/** Standalone renewal retains its exact two-field contract. */
export async function readDevelopmentPreviewGrantRenewal(request:Request):Promise<{
 sourceVersion:number;grantToken:string;
}> {
 const body=await readDevelopmentPreviewUpdate(request);
 if(!body.grantToken)throw new DevelopmentPreviewBodyError(400);
 return {sourceVersion:body.sourceVersion,grantToken:body.grantToken};
}
