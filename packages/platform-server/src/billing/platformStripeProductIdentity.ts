import {resolvePlatformProductForPrice,type PlatformPriceRecord,type PlatformBillingProduct} from "./productCatalog";
const ID=/^prod_[A-Za-z0-9_]+$/;
/** Explicit allowlist of Stripe PRODUCT identities; prices alone are not product evidence. */
export function registeredBuilderStripeProducts(env:Readonly<Record<string,string|undefined>>):ReadonlySet<string>{
  const raw=env.ZOEBUILD_AI_STRIPE_PRODUCT_IDS?.trim();
  if(!raw) return new Set(); // No verified product => no Builder Checkout/grants.
  const items=raw.split(",").map(s=>s.trim());
  if(items.some(s=>!ID.test(s))||new Set(items).size!==items.length)
    throw Error("Invalid ZOEBUILD_AI_STRIPE_PRODUCT_IDS configuration");
  return new Set(items);
}
export function stripePriceProductId(value:unknown):string|null{
  if(typeof value==="string")return ID.test(value)?value:null;
  if(value&&typeof value==="object"&&"id" in value){
    const id=(value as {id:unknown}).id;
    return typeof id==="string"&&ID.test(id)?id:null;
  }
  return null;
}
/** Do not infer Builder identity from price mapping or user-owned subscription alone. */
export function verifiedStripePlatformProduct(input:Readonly<{
  priceId:string|null; stripeProductId:string|null; subscriptionProductHint?:string|null;
  catalog:readonly PlatformPriceRecord[]; builderProductIds:ReadonlySet<string>;
}>):PlatformBillingProduct|null{
  const mapped=input.priceId?resolvePlatformProductForPrice(input.catalog,input.priceId)?.product:null;
  if(!mapped)return null;
  if(mapped==="builder_ai"){
    if(!input.stripeProductId||!input.builderProductIds.has(input.stripeProductId)||
      input.subscriptionProductHint!=="builder_ai")return null;
  }else if(input.subscriptionProductHint==="builder_ai"||
    (input.stripeProductId&&input.builderProductIds.has(input.stripeProductId)))return null;
  return mapped;
}
export function requireVerifiedBuilderStripePrice(input:Readonly<{
  priceId:string;stripeProductId:string|null;catalog:readonly PlatformPriceRecord[];
  builderProductIds:ReadonlySet<string>;
}>):void{
  if(verifiedStripePlatformProduct({...input,subscriptionProductHint:"builder_ai"})!=="builder_ai")
    throw Error("BUILDER_STRIPE_PRODUCT_IDENTITY_MISMATCH");
}
