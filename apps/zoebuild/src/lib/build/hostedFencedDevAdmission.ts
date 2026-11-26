// Local operator acceptance only. Not a billing or production entitlement.
export function allowsDedicatedFencedDevOperator(input:Readonly<{
  origin:string; projectId:string; userId:string; selectedOwnerId:string;
  env:Readonly<Record<string,string|undefined>>;
}>):boolean {
  const {origin,projectId,userId,selectedOwnerId,env}=input;
  return env.NODE_ENV==="development" && env.VERCEL_ENV!=="production" &&
    env.ZOEBUILD_PUBLISH_ENABLED==="0" && env.ZOEBUILD_HOSTED_PUBLISH_DEV==="1" &&
    env.ZOEBUILD_HOSTED_FENCED_DEV==="1" &&
    (origin==="http://localhost:3004" || origin==="http://127.0.0.1:3004") &&
    projectId==="cmwvhcusk0002u0dlwhxh9uh2" && env.ZOEBUILD_HOSTED_FENCED_DEV_PROJECT===projectId &&
    !!userId && userId===selectedOwnerId && userId===env.ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER;
}
