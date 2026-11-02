import "server-only";
import {prisma} from "@zoeskoul/platform-server/prisma";
import {readLatestOwnedPublishedDeployment} from "./publishedDeploymentStatus";
import {describeZoePublishedRecord} from "./zoeDeploymentEvidence";

/** Owner authority must be established in the route before calling. */
export async function resolveZoeDeploymentReality(input:Readonly<{
  ownerId:string;buildProjectId:string;currentSourceVersion:number;
}>) {
  try {
    const snapshot=await readLatestOwnedPublishedDeployment(prisma,{
      ownerId:input.ownerId,buildProjectId:input.buildProjectId,
    });
    return describeZoePublishedRecord(snapshot,input.currentSourceVersion);
  } catch (error) {
    console.warn("[Zoé deployment status] read unavailable",{
      errorName:error instanceof Error?error.name:"UnknownError",
    });
    return {state:"status-unavailable" as const};
  }
}
