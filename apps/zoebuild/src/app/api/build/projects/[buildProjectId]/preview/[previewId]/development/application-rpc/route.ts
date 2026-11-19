import { handleDevelopmentApplicationRpc } from "@/lib/build/reactPreviewDevelopmentApplicationRpc";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Editor-only relay, not an iframe content endpoint. No CORS/GET handlers. */
export async function POST(req:Request,ctx:{params:Promise<{buildProjectId:string;previewId:string}>}) {
  return handleDevelopmentApplicationRpc(req,await ctx.params);
}
