import { NextResponse } from "next/server";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { requireOwnedReactPreviewProject, ReactPreviewRequestError } from "@/lib/build/reactPreviewServer";
import { cancelTrustedReactPreviewOperationAtRunner } from "@/lib/build/reactPreviewRunnerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: {params: Promise<{ buildProjectId: string; operationId: string }>}) {
  if (!enforceSameOriginPost(req)) return NextResponse.json({ok:false}, {status:403});
  const access = await loadCurrentBuildAccessSnapshot();
  if (!access.userId) return NextResponse.json({ok:false}, {status:401});
  const {buildProjectId,operationId} = await ctx.params;
  if (!/^preview_op_[0-9a-f-]{36}$/i.test(operationId)) return NextResponse.json({ok:false}, {status:400});
  try {
    await requireOwnedReactPreviewProject({access,buildProjectId});
    await cancelTrustedReactPreviewOperationAtRunner({actorKey:await requireRunnerActorKey(access.userId), operationId, buildProjectId});
    return NextResponse.json({ok:true});
  } catch (error) {
    if (error instanceof ReactPreviewRequestError) return NextResponse.json({ok:false}, {status:error.status});
    if (error instanceof RunnerHttpError) return NextResponse.json({ok:false}, {status:error.status===404?404:503});
    return NextResponse.json({ok:false}, {status:503});
  }
}
