import { runPrivatePublish } from "@/lib/build/tanstackPublishPilotServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Explicit local operator lane; no public hosting or UI integration. */
export async function POST(req:Request,ctx:{params:Promise<{buildProjectId:string}>}) {
  return runPrivatePublish(req,ctx,true,true);
}
