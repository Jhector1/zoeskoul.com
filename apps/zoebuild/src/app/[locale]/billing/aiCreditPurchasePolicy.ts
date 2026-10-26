/** Browser display/retry safety only. Payment authority remains Web/Stripe. */
export type CreditFundingMode="off"|"sandbox-only"|"live";
export type AiCreditPack=Readonly<{priceId:string;amountUsdMinor:number;creditUnits:string}>;
export type AiCreditCatalog=Readonly<{available:boolean;mode:CreditFundingMode;packs:readonly AiCreditPack[]}>;
const PRICE=/^price_[A-Za-z0-9_]+$/;
const UNITS=/^[1-9][0-9]*$/;
const MAX_UNITS=9223372036854775807n;
const KEY="zoebuild.aiCredit.checkoutAttempt.v1";
const ID=/^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const TTL=80*60*1000;

export function parseAiCreditCatalog(value:unknown):AiCreditCatalog{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid credit-pack catalog");
 const data=value as Record<string,unknown>;
 if(typeof data.available!=="boolean"||!["off","sandbox-only","live"].includes(String(data.mode))||!Array.isArray(data.packs)||data.packs.length>16)throw Error("Invalid credit-pack catalog");
 const ids=new Set<string>();const packs:AiCreditPack[]=[];
 for(const value of data.packs){
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Invalid credit pack");
  const item=value as Record<string,unknown>;
  if(typeof item.priceId!=="string"||!PRICE.test(item.priceId)||ids.has(item.priceId)||
     typeof item.amountUsdMinor!=="number"||!Number.isSafeInteger(item.amountUsdMinor)||item.amountUsdMinor<=0||
     typeof item.creditUnits!=="string"||!UNITS.test(item.creditUnits)||BigInt(item.creditUnits)>MAX_UNITS)throw Error("Invalid credit pack");
  ids.add(item.priceId);packs.push({priceId:item.priceId,amountUsdMinor:item.amountUsdMinor,creditUnits:item.creditUnits});
 }
 if(data.available!==(packs.length>0)||(data.mode==="off"&&packs.length>0))throw Error("Inconsistent credit-pack catalog");
 return {available:data.available,mode:data.mode as CreditFundingMode,packs};
}
export function creditCatalogAvailabilityMessage(mode:CreditFundingMode):string{
 if(mode==="live")return "No independently approved live credit packs are available. No payment can be initiated here.";
 if(mode==="sandbox-only")return "No verified Stripe test credit packs are available. Test purchases do not charge a real payment method.";
 return "AI credit purchases are not enabled on this server. Your subscription, existing balance, and projects are unchanged.";
}
/** Preserve outstanding IDs across refresh, timeout and cancellation. Never rotate an unverified payment. */
export function getOrCreateCreditCheckoutAttempt(input:Readonly<{
 storage:Pick<Storage,"getItem"|"setItem">;mode:Exclude<CreditFundingMode,"off">;priceId:string;now:number;createUuid:()=>string;
}>):string{
 const pending="An earlier credit checkout needs verification before another payment. Review credit activity or contact support.";
 if(!PRICE.test(input.priceId)||!Number.isSafeInteger(input.now)||input.now<0)throw Error("Invalid credit checkout request.");
 let stored:string|null;
 try{stored=input.storage.getItem(KEY);}catch{throw Error("Secure checkout retry storage is unavailable. No new payment was started.");}
 if(stored!==null){
  let item:unknown;try{item=JSON.parse(stored);}catch{throw Error(pending);}
  if(!item||typeof item!=="object"||Array.isArray(item))throw Error(pending);
  const old=item as Record<string,unknown>;
  // Existing V1 identities were issued by the test-only panel; protect them without authorizing live reuse.
  const mode=old.mode===undefined?"sandbox-only":old.mode;
  if(mode===input.mode&&old.priceId===input.priceId&&typeof old.id==="string"&&ID.test(old.id)&&
    typeof old.time==="number"&&Number.isSafeInteger(old.time)&&input.now>=old.time&&input.now-old.time<TTL)return old.id;
  throw Error(pending);
 }
 const id=`zb-ai-${input.createUuid()}`;
 if(!ID.test(id))throw Error("Secure checkout identity could not be created.");
 try{input.storage.setItem(KEY,JSON.stringify({mode:input.mode,priceId:input.priceId,id,time:input.now}));}
 catch{throw Error("Secure checkout retry storage is unavailable. No new payment was started.");}
 return id;
}
