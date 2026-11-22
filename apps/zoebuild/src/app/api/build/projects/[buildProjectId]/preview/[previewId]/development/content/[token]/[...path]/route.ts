import { readOwnedDevelopmentPreviewBrowserContent } from "@/lib/build/reactPreviewDevelopmentBrowserRead";
import { normalizeDevelopmentPreviewBrowserPath } from "@/lib/build/reactPreviewDevelopmentBrowserPath";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const ERROR_HEADERS={"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
type Context={params:Promise<{buildProjectId:string;previewId:string;token:string;path?:string[]}>};
async function read(req:Request,ctx:Context,method:"GET"|"HEAD") {
 if(process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED!=="true")
   return new Response(null,{status:404,headers:ERROR_HEADERS});
 try {
  const {buildProjectId,previewId,token}=await ctx.params;
  const path=normalizeDevelopmentPreviewBrowserPath(new URL(req.url),buildProjectId,previewId,token);
  return await readOwnedDevelopmentPreviewBrowserContent({token,buildProjectId,previewId,path,method,
    accept:/^text\/css(?:[,;]|$)/i.test(req.headers.get("accept")??"")?"text/css":"*/*"});
 } catch {return new Response(null,{status:404,headers:ERROR_HEADERS});}
}
export async function GET(req:Request,ctx:Context){return read(req,ctx,"GET");}
export async function HEAD(req:Request,ctx:Context){return read(req,ctx,"HEAD");}
