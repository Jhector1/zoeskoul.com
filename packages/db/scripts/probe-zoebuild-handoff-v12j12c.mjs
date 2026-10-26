/** V12J.12C local READ-ONLY authority probe. No user session, cookie, database write or secrets in stdout.
 * Only loopback HTTP targets are accepted: a service bearer must never be sent to an arbitrary origin.
 * A random, unallocated session hash forces Redis lookup without resolving a user.
 */
import {randomBytes} from 'node:crypto';

const WEB='http://localhost:3000';
const BUILD='http://localhost:3004';
const mark=(label,status)=>console.log(`V12J12C_${label}=${status}`);
function fail(code){console.error(`V12J12C_PROBE_FAIL reason=${code}`);process.exitCode=1;}
async function check(){
  if(process.argv.length!==3||process.argv[2]!=='--check')return fail('USAGE');
  const secret=process.env.ZOESKOUL_BUILD_HANDOFF_SECRET?.trim();
  if(!secret||secret.length<48)return fail('SERVICE_SECRET_NOT_CONFIGURED');
  const hash=randomBytes(32).toString('hex');
  for(const [name,path] of [['WEB_SESSION','session'],['WEB_RENEW','renew']]){
    let response;
    try{
      response=await fetch(`${WEB}/api/auth/build-handoff/${path}`,{
        method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${secret}`,
          'Content-Type':'application/json'},body:JSON.stringify({sessionHash:hash}),
        cache:'no-store',signal:AbortSignal.timeout(7000),
      });
    }catch{return fail(`${name}_UNREACHABLE`);}
    mark(name,response.status);
    if(response.status!==200){
      if(response.status===401)return fail(`${name}_SERVICE_AUTH_MISMATCH`);
      if(response.status===503)return fail(`${name}_AUTHORITY_OR_REDIS_UNAVAILABLE`);
      if(response.status===404)return fail(`${name}_WEB_ROUTE_NOT_RUNNING`);
      return fail(`${name}_HTTP_${response.status}`);
    }
    let data;
    try{data=await response.json();}catch{return fail(`${name}_UNEXPECTED_PAYLOAD`);}
    if(data?.authenticated!==false)return fail(`${name}_UNEXPECTED_SESSION_RESULT`);
  }
  let response;
  try{response=await fetch(`${BUILD}/api/auth/handoff/start?returnTo=%2Fen%2Fprojects`,{
    redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(7000),
  });}catch{return fail('BUILDER_START_UNREACHABLE');}
  mark('BUILDER_START',response.status);
  if(response.status!==303)return fail('BUILDER_START_NOT_REDIRECTING');
  let target;
  try{target=new URL(response.headers.get('location')||'');}
  catch{return fail('BUILDER_START_LOCATION_INVALID');}
  if(target.origin!==WEB||target.pathname!=='/en/authenticate')
    return fail('BUILDER_START_REDIRECT_TARGET_MISMATCH');
  console.log('V12J12C_AUTHORITY_PROBE_PASS webSession=200 webRenew=200 builderStart=303');
  console.log('NOTE=Does_not_prove_browser_login_or_user_cookie; test_direct_browser_navigation_next');
}
await check();
