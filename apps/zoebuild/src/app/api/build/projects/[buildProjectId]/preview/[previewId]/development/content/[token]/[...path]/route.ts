import { readOwnedDevelopmentPreviewBrowserContent } from "@/lib/build/reactPreviewDevelopmentBrowserRead";
import { normalizeDevelopmentPreviewBrowserPath } from "@/lib/build/reactPreviewDevelopmentBrowserPath";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const ERROR_HEADERS={"Cache-Control":"no-store","Referrer-Policy":"no-referrer",
 "X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":"*",
 "Cross-Origin-Resource-Policy":"cross-origin"};
type Context={params:Promise<{buildProjectId:string;previewId:string;token:string;path?:string[]}>};
async function read(req:Request,ctx:Context,method:"GET"|"HEAD") {
 const started=Date.now();
 let stage="feature_gate";
 let root=false;
 const diagnostic=(status:number)=>{
  if(process.env.NODE_ENV==="development" && (root || status>=400))
   console.info("[ZOE-PREVIEW-ROUTE]",JSON.stringify({method,stage,root,status,elapsedMs:Date.now()-started}));
 };
 if(process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED!=="true")
   {diagnostic(404);return new Response(null,{status:404,headers:ERROR_HEADERS});}
 try {
  stage="route_params";
  const {buildProjectId,previewId,token}=await ctx.params;
  stage="path_normalization";
  const path=normalizeDevelopmentPreviewBrowserPath(new URL(req.url),buildProjectId,previewId,token);
  root=path==="" || path==="/";
  stage="browser_read";
  const result=await readOwnedDevelopmentPreviewBrowserContent({token,buildProjectId,previewId,path,method,
    accept:/^text\/css(?:[,;]|$)/i.test(req.headers.get("accept")??"")?"text/css":"*/*"});
  stage="response";diagnostic(result.status);return result;
 } catch {diagnostic(404);return new Response(null,{status:404,headers:ERROR_HEADERS});}
}
export async function GET(req:Request,ctx:Context){return read(req,ctx,"GET");}
export async function HEAD(req:Request,ctx:Context){return read(req,ctx,"HEAD");}
