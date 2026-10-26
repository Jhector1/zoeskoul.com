#!/usr/bin/env node
/** Stripe test-only $5 one-time Price preparation. Never reads or prints user data.
 * --check: read-only, --create-test-price --confirm-test-write: explicitly writes
 * only to a Stripe TEST account. Neither mode touches Postgres, env, or billing.
 */
import { Buffer } from "node:buffer";
const args=process.argv.slice(2);
const create=args.length===2&&args.includes("--create-test-price")&&args.includes("--confirm-test-write");
const check=args.length===1&&args[0]==="--check";
if(!create&&!check){console.error("USAGE --check | --create-test-price --confirm-test-write");process.exit(2);}
const key=process.env.LEARNOIR_STRIPE_SECRET_KEY;
if(!key?.startsWith("sk_test_") || key.length<24){console.error("REFUSED: STRIPE_TEST_SECRET_NOT_CONFIGURED");process.exit(2);}
const lookup="zoebuild_ai_credit_500_usd_v1";
const good=(p)=>p&&p.object==="price"&&p.livemode===false&&p.active===true&&
  p.currency==="usd"&&p.unit_amount===500&&p.type==="one_time"&&
  p.billing_scheme==="per_unit"&&!p.recurring&&!p.custom_unit_amount;
async function call(path,options={}){
  const result=await fetch(`https://api.stripe.com/v1/${path}`,{
    ...options,headers:{...options.headers,Authorization:"Basic "+Buffer.from(key+":").toString("base64")},
    signal:AbortSignal.timeout(20000),redirect:"error"});
  if(!result.ok){console.error("STRIPE_REQUEST_FAILED status="+result.status);process.exit(2);}
  return result.json();
}
try{
  if(check){
    const id=process.env.ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID;
    if(!id||!/^price_[A-Za-z0-9_]+$/.test(id)){console.log("TEST_PRICE_ID_NOT_CONFIGURED");process.exit(2);}
    const price=await call("prices/"+encodeURIComponent(id));
    if(!good(price)){console.log("TEST_PRICE_MISMATCH");process.exit(2);}
    console.log("V12J15A_TEST_PRICE_VERIFIED=YES usdMinor=500 credits=500 ledgerUnits=500000");
  }else{
    const params=new URLSearchParams({"lookup_keys[]":lookup,limit:"10"});
    const found=await call("prices?"+params.toString());
    if(found.has_more||!Array.isArray(found.data)||found.data.length>1){console.log("TEST_PRICE_LOOKUP_AMBIGUOUS");process.exit(2);}
    let price=found.data[0];
    if(!price){
      const form=new URLSearchParams({
        currency:"usd",unit_amount:"500",lookup_key:lookup,
        "product_data[name]":"ZoeBuild 500 AI credits (test acceptance)",
        "metadata[zoebuildAiCreditPack]":"500-v1",
        "metadata[ledgerUnits]":"500000"
      });
      price=await call("prices",{method:"POST",headers:{
        "Content-Type":"application/x-www-form-urlencoded",
        "Idempotency-Key":"zoebuild-test-price-500-v12j15a-v1"
      },body:form.toString()});
    }
    if(!good(price)){console.log("TEST_PRICE_MISMATCH");process.exit(2);}
    console.log("V12J15A_STRIPE_TEST_PRICE_READY=YES");
    console.log("ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID="+price.id);
    console.log("Store this Price ID in the WEB server environment only; no environment file was changed.");
  }
}catch(e){console.error("STRIPE_TEST_PRICE_UNAVAILABLE reason="+(e?.name??"ERROR"));process.exit(2);}
