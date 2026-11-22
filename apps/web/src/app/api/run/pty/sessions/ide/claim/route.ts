import { NextRequest, NextResponse } from "next/server";
import { getActor, actorKeyOf } from "@/lib/practice/actor";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";
export const runtime = "nodejs";
function reply(body: object,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});}
export async function POST(req: NextRequest) {
  const origin=process.env.ZOESKOUL_LEARNING_WEB_ORIGIN || new URL(req.url).origin;
  if(req.headers.get("origin")!==origin) return reply({ok:false,error:"Forbidden."},403);
  if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return reply({ok:false,error:"Expected JSON."},415);
  try {
    const reader=req.body?.getReader();if(!reader)return reply({ok:false,error:"Invalid request."},400);
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024){await reader.cancel();return reply({ok:false,error:"Invalid request."},413);}chunks.push(part.value);}
    let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return reply({ok:false,error:"Invalid request."},400);}
    if(!body||typeof body!=="object"||Array.isArray(body)||!(Object.keys(body).length===1 && !("intent" in body) || Object.keys(body).length===2 && "intent" in body && body.intent==="status")||!("windowId" in body)||typeof body.windowId!=="string"||!/^window-[a-zA-Z0-9-]{8,96}$/.test(body.windowId))return reply({ok:false,error:"Invalid IDE window identity."},400);
    const actor=await getActor();if(!actor.userId)return reply({ok:false,error:"Sign in required."},401);
    const key=await requireRunnerActorKey();if(key!==actorKeyOf(actor))return reply({ok:false,error:"Forbidden."},403);
    const statusOnly="intent" in body && body.intent==="status";
    const result=await runnerPost<{ok?:boolean;enabled?:boolean;status?:string}>("/sessions/ide/claim",key,{windowId:body.windowId,...(statusOnly?{intent:"status"}:{})});
    if(result.ok!==true||typeof result.enabled!=="boolean")return reply({ok:false,error:"IDE ownership unavailable."},503);
    if(statusOnly && result.enabled && !["current","superseded","unclaimed"].includes(result.status??""))return reply({ok:false,error:"IDE ownership unavailable."},503);
    return reply({ok:true,enabled:result.enabled,...(statusOnly&&result.enabled?{status:result.status}:{})});
  }catch(error){if(error instanceof RunnerHttpError&&error.status===423)return reply({ok:false,error:"Existing Linux session requires a user decision."},423);if(error instanceof RunnerHttpError&&error.status===409)return reply({ok:false,error:"IDE superseded. Open a new IDE to take ownership."},409);return reply({ok:false,error:"IDE ownership unavailable."},503);}
}
