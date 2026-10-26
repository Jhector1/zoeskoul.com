import {NextRequest,NextResponse} from "next/server";
import {SESSION_COOKIE,requestBuilderAiCreditService} from "@/lib/auth/buildHandoff";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:NextRequest){
  try {
    const upstream=await requestBuilderAiCreditService(request.cookies.get(SESSION_COOKIE)?.value,{action:"catalog"});
    if(!upstream) return NextResponse.json({code:"SESSION_EXPIRED"},{status:401,headers});
    if(upstream.status===401) return NextResponse.json({code:"SESSION_EXPIRED"},{status:401,headers});
    if(!upstream.ok)return NextResponse.json({code:"CREDIT_CATALOG_UNAVAILABLE"},{status:503,headers});
    const result:unknown=await upstream.json();
    if(!result || typeof result!=="object" || Array.isArray(result))throw new Error("Invalid authority response");
    const data=result as {available?:unknown;mode?:unknown;packs?:unknown};
    if(typeof data.available!=="boolean" || !Array.isArray(data.packs) ||
       (data.mode!=="off"&&data.mode!=="sandbox-only"&&data.mode!=="live"))throw new Error("Invalid authority response");
    const packs=data.packs.map((p:unknown)=>{
      if(!p || typeof p!=="object" || Array.isArray(p))throw new Error("Invalid pack");
      const pack=p as {priceId?:unknown;amountUsdMinor?:unknown;creditUnits?:unknown};
      if(typeof pack.priceId!=="string" || !/^price_[A-Za-z0-9_]+$/.test(pack.priceId) ||
         typeof pack.amountUsdMinor!=="number" || !Number.isSafeInteger(pack.amountUsdMinor) || pack.amountUsdMinor<=0 ||
         typeof pack.creditUnits!=="string" || !/^[1-9][0-9]*$/.test(pack.creditUnits))throw new Error("Invalid pack");
      return {priceId:pack.priceId,amountUsdMinor:pack.amountUsdMinor,creditUnits:pack.creditUnits};
    });
    // An authenticated user sees only the Web-verified, mode-bound catalog.
    // Never silently translate a live catalog into test-mode or vice versa.
    if(data.available !== (packs.length>0) || packs.length>16 ||
       (data.mode==="off" && packs.length>0) ||
       new Set(packs.map(p=>p.priceId)).size!==packs.length ||
       packs.some(p=>BigInt(p.creditUnits)>9223372036854775807n))
      throw new Error("Inconsistent catalog");
    return NextResponse.json({available:data.available,mode:data.mode,packs},{headers});
  }catch{return NextResponse.json({code:"CREDIT_CATALOG_UNAVAILABLE"},{status:503,headers});}
}
