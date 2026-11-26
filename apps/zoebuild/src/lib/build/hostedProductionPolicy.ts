// Production pilot policy. No development entitlement exception or browser-controlled transport.
export type HostedEnv=Readonly<Record<string,string|undefined>>;
const ID=/^[A-Za-z0-9_-]{4,128}$/;
const LABEL=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SUFFIX=new Set(["com","net","org","site","app","dev"]);
function originHost(origin:string|undefined):string|null {
  const m=origin?.match(/^https:\/\/([a-z0-9.-]+)$/);
  if(!m || m[0]!==origin) return null;
  const labels=m[1].split(".");
  return m[1].length<=253 && labels.length>=2 && labels.every(l=>LABEL.test(l)&&!l.startsWith("xn--")) && SUFFIX.has(labels[labels.length-1]) ? m[1]:null;
}
export function productionHostedConfig(env:HostedEnv) {
  if(env.NODE_ENV!=="production" || env.ZOEBUILD_HOSTED_FENCED_PRODUCTION!=="1" || !["0","false"].includes(env.ZOEBUILD_PUBLISH_ENABLED??"") || env.ZOEBUILD_HOSTED_PRODUCTION_HTTPS_READY!=="1") return null;
  if(env.ZOEBUILD_HOSTED_PUBLISH_DEV==="1"||env.ZOEBUILD_HOSTED_FENCED_DEV==="1"||env.ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION==="1") return null;
  const projectId=env.ZOEBUILD_HOSTED_PRODUCTION_PROJECT??"", ownerId=env.ZOEBUILD_HOSTED_PRODUCTION_OWNER??"";
  const publicOrigin=env.ZOEBUILD_HOSTED_PRODUCTION_PUBLIC_ORIGIN??"", controlOrigin=env.ZOEBUILD_HOSTED_PRODUCTION_CONTROL_ORIGIN??"";
  const domain=originHost(publicOrigin), control=originHost(controlOrigin);
  if(!ID.test(projectId)||!ID.test(ownerId)||!domain||!control||domain.split(".").length!==2||domain===control.split(".").slice(-2).join(".")) return null;
  return {projectId,ownerId,publicOrigin,controlOrigin,domain};
}
export function productionHostedSelection(projectId:string,env:HostedEnv){
  const cfg=productionHostedConfig(env);
  return cfg?.projectId===projectId?cfg:null;
}
export function productionHostedUiAllowed(projectId:string,userId:string|null|undefined,stackId:string|null|undefined,env:HostedEnv){
  const p=productionHostedSelection(projectId,env);
  return !!p && p.ownerId===userId && stackId==="tanstack-start-v1";
}
export function productionHostedRequest(origin:string,projectId:string,env:HostedEnv){
  const p=productionHostedSelection(projectId,env);
  return p?.controlOrigin===origin?p:null;
}
export function productionControlArgs(projectId:string,operation:"fenced-ack"|"fenced-apply"){
  if(!ID.test(projectId)||!["fenced-ack","fenced-apply"].includes(operation))throw new Error("PRODUCTION_CONTROL_INPUT_INVALID");
  return ["-T","-F","/dev/null","-i","/run/secrets/zoebuild_hosting_control_key","-o","IdentitiesOnly=yes","-o","IdentityAgent=none","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","UserKnownHostsFile=/run/secrets/zoebuild_hosting_known_hosts","-o","GlobalKnownHostsFile=/dev/null","-o","ClearAllForwardings=yes","-o","ConnectTimeout=10","-o","ServerAliveInterval=15","-o","ServerAliveCountMax=2","zoebuild-publish@85.239.233.177",`${operation} ${projectId}`];
}
