import { managePrivatePublish } from "@/lib/build/tanstackPublishPilotServer";
async function manage(req:Request,ctx:{params:Promise<{buildProjectId:string}>}) {
  if(process.env.NODE_ENV==="production" && process.env.ZOEBUILD_HOSTED_FENCED_PRODUCTION==="1") {
    const {buildProjectId}=await ctx.params;
    const {productionHostedSelection}=await import("@/lib/build/hostedProductionPolicy");
    if(productionHostedSelection(buildProjectId,process.env)) {
      const {manageDedicatedFenced}=await import("@/lib/build/hostedFencedManagement");
      return manageDedicatedFenced(req,ctx);
    }
  }
  if (process.env.NODE_ENV==="development" && process.env.ZOEBUILD_PUBLISH_ENABLED==="0" && process.env.ZOEBUILD_HOSTED_FENCED_DEV==="1") {
    const {buildProjectId}=await ctx.params;
    const { dedicatedFencedUiSelected, manageDedicatedFenced }=await import("@/lib/build/hostedFencedManagement");
    if(dedicatedFencedUiSelected(buildProjectId)) return manageDedicatedFenced(req,ctx);
  }
  return managePrivatePublish(req,ctx);
}
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:Request,ctx:{params:Promise<{buildProjectId:string}>}) {return manage(req,ctx);}
export async function POST(req:Request,ctx:{params:Promise<{buildProjectId:string}>}) {return manage(req,ctx);}
