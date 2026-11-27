import { projectThumbnailEnabled, readProjectThumbnail, readProjectThumbnailDisplay } from "@/lib/build/projectThumbnail";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin","Content-Security-Policy":"default-src 'none'; sandbox"};
export async function GET(req:Request,ctx:{params:Promise<{buildProjectId:string;sourceVersion:string}>}){
  if(!projectThumbnailEnabled())return new Response(null,{status:404,headers});
  try{
    const {buildProjectId,sourceVersion}=await ctx.params;
    if(!/^[1-9][0-9]{0,15}$/.test(sourceVersion)||!Number.isSafeInteger(Number(sourceVersion)))return new Response(null,{status:404,headers});
    // Only successful, authorized reads may report a cache miss (204).
    // All disabled, invalid, unauthorized or failed reads remain indistinguishable (404).
    if(new URL(req.url).searchParams.get("display")==="1"){
      const display=await readProjectThumbnailDisplay(req,buildProjectId,Number(sourceVersion));
      const stateHeaders={...headers,"X-ZoeBuild-Thumbnail-Capture":display.capturing?"pending":"idle"};
      return display.bytes?new Response(Uint8Array.from(display.bytes),{headers:{...stateHeaders,"Content-Type":"image/jpeg","X-ZoeBuild-Thumbnail-Version":String(display.version)}}):new Response(null,{status:204,headers:stateHeaders});
    }
    const bytes=await readProjectThumbnail(req,buildProjectId,Number(sourceVersion));
    return bytes?new Response(Uint8Array.from(bytes),{headers:{...headers,"Content-Type":"image/jpeg"}}):new Response(null,{status:204,headers});
  }catch{return new Response(null,{status:404,headers});}
}
