import { runPrivatePublish } from "@/lib/build/tanstackPublishPilotServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req:Request, ctx:{params:Promise<{buildProjectId:string}>}) {
  return runPrivatePublish(req,ctx);
}
