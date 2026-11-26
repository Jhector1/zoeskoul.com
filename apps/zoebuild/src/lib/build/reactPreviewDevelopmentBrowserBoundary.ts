import { developmentCapacityFailure } from "./reactPreviewDevelopmentFailure";
import { NextResponse } from "next/server";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { ReactPreviewRequestError } from "@/lib/build/reactPreviewServer";
import { DevelopmentPreviewBodyError } from "@/lib/build/reactPreviewDevelopmentHttp";

export function response(requestId: string, data: Record<string,unknown>, status=200) {
  const result=NextResponse.json({...data,requestId},{status});
  result.headers.set("Cache-Control","no-store, max-age=0");
  result.headers.set("X-Request-Id",requestId);
  return result;
}

export function browserError(requestId:string,error:unknown) {
  if (error instanceof DevelopmentPreviewBodyError)
    return response(requestId,{ok:false,code:"BUILD_PREVIEW_INVALID",message:error.message},error.status);
  if (error instanceof ReactPreviewRequestError)
    return response(requestId,{ok:false,code:error.code,message:error.message},error.status);
  if (error instanceof RunnerHttpError) {
    const capacity = error.status === 503 ? developmentCapacityFailure(error.code) : null;
    if (capacity) return response(requestId,{ok:false,...capacity},503);
    const status=error.status===404?404:error.status===409?409:503;
    const retryableUpdate=status===503 && error.code==="UPDATE_PRE_WRITE_AUTHORITY_FAILED";
    const restartRequired=status===409 && error.code==="RESTART_REQUIRED";
    return response(requestId,{ok:false,
      code:status===404?"BUILD_PREVIEW_NOT_FOUND":status===409?
        (restartRequired?"BUILD_PREVIEW_RESTART_REQUIRED":"BUILD_PREVIEW_SOURCE_CONFLICT"):
        retryableUpdate?"BUILD_PREVIEW_UPDATE_RETRYABLE":"BUILD_PREVIEW_UNAVAILABLE",
      message:status===409?(restartRequired?"Preview files require restart.":"Preview revision is stale."):
        retryableUpdate?"Development preview update was not applied.":
          "Development preview is unavailable.",
    },status);
  }
  return response(requestId,{ok:false,code:"BUILD_PREVIEW_UNAVAILABLE",
    message:"Development preview is unavailable."},503);
}
