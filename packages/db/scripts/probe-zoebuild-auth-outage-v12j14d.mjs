import {randomBytes} from "node:crypto";
const AUTH="ZOESKOUL_BUILD_HANDOFF_SECRET";
const secret=process.env[AUTH]?.trim();
const web="http://localhost:3000";
if(process.argv.includes("--check")===false){console.error("Specify --check");process.exit(2);}
if(!secret || secret.length<48){console.log("SESSION_PROBE=NO_SERVICE_SECRET_IN_SCRIPT_ENV");process.exit(2);}
for(const endpoint of ["session","renew"]){
  const elapsed=Date.now();
  let result="UNAVAILABLE";
  try{
    const r=await fetch(web+"/api/auth/build-handoff/"+endpoint,{
      method:"POST",redirect:"manual",cache:"no-store",
      headers:{"Authorization":"Bearer "+secret,"Content-Type":"application/json"},
      body:JSON.stringify({sessionHash:randomBytes(32).toString("hex")}),
      signal:AbortSignal.timeout(30000),
    });
    // Never print response body or any credential/ID. An unallocated hash must be unauthenticated.
    const body=await r.json().catch(()=>null);
    result=r.status===200 && body?.authenticated===false?"PASS_UNKNOWN_SESSION":
      r.status===503?"WEB_AUTHORITY_OR_REDIS_UNAVAILABLE":
      r.status===401?"SERVICE_AUTH_MISMATCH":"HTTP_"+r.status;
  }catch(e){result=e?.name==="TimeoutError"?"TIMEOUT":"TRANSPORT_ERROR";}
  console.log(`V12J14D_${endpoint.toUpperCase()}=${result} elapsedMs=${Date.now()-elapsed}`);
}
