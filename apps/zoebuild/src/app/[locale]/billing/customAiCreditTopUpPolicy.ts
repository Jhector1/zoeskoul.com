/** Display and retry identity only. Web/Stripe remain the payment and grant authority. */
const STORAGE_KEY = "zoebuild.aiCredit.checkoutAttempt.v1";
const ATTEMPT_ID = /^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const TTL_MS = 80 * 60 * 1000;
const PENDING = "An earlier credit checkout needs verification before another payment. Review your credit activity or contact support.";
export type CustomCreditAmount = Readonly<{
  amountUsdMinor: number;
  customerCredits: number;
  ledgerUnits: string;
}>;

export function customCreditAmount(value: string, input: "usd" | "credits"): CustomCreditAmount {
  if (typeof value !== "string" || value.length > 16) throw Error("Enter an amount between $5 and $500.");
  let cents: number;
  if (input === "usd") {
    // Money never uses binary floating-point or rounds an invalid third decimal.
    if (!/^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?$/.test(value))
      throw Error("Enter dollars with no more than two decimal places.");
    const [dollars, decimals = ""] = value.split(".");
    cents = Number(dollars) * 100 + Number(decimals.padEnd(2, "0"));
  } else if (input === "credits") {
    if (!/^[1-9][0-9]{0,5}$/.test(value))
      throw Error("Enter a whole number of credits.");
    cents = Number(value);
  } else throw Error("Invalid credit amount unit.");
  if (!Number.isSafeInteger(cents) || cents < 500 || cents > 50000)
    throw Error("Custom purchases must be between $5 (500 credits) and $500 (50,000 credits).");
  return {amountUsdMinor:cents,customerCredits:cents,ledgerUnits:String(BigInt(cents)*1000n)};
}

/** Shared identity with the fixed-pack panel prevents a second unverified checkout. */
export function getOrCreateCustomCreditCheckoutAttempt(input: Readonly<{
  storage: Pick<Storage,"getItem"|"setItem">;
  amountUsdMinor: number;
  now: number;
  createUuid: () => string;
}>): string {
  if (!Number.isSafeInteger(input.amountUsdMinor) || input.amountUsdMinor < 500 ||
      input.amountUsdMinor > 50000 || !Number.isSafeInteger(input.now) || input.now < 0)
    throw Error("Invalid custom credit checkout request.");
  let stored: string | null;
  try { stored = input.storage.getItem(STORAGE_KEY); }
  catch { throw Error("Secure checkout retry storage is unavailable. No payment was started."); }
  if (stored !== null) {
    let value: unknown;
    try { value = JSON.parse(stored); } catch { throw Error(PENDING); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error(PENDING);
    const saved = value as Record<string, unknown>;
    if (saved.purchaseKind === "custom" && saved.mode === "sandbox-only" &&
        saved.amountUsdMinor === input.amountUsdMinor && typeof saved.id === "string" &&
        ATTEMPT_ID.test(saved.id) && typeof saved.time === "number" &&
        Number.isSafeInteger(saved.time) && input.now >= saved.time &&
        input.now - saved.time < TTL_MS) return saved.id;
    throw Error(PENDING);
  }
  const id = `zb-ai-${input.createUuid()}`;
  if (!ATTEMPT_ID.test(id)) throw Error("Secure checkout identity could not be created.");
  try { input.storage.setItem(STORAGE_KEY,JSON.stringify({purchaseKind:"custom",mode:"sandbox-only",
    amountUsdMinor:input.amountUsdMinor,id,time:input.now})); }
  catch { throw Error("Secure checkout retry storage is unavailable. No payment was started."); }
  return id;
}

/**
 * Read-only presentation of the SAME payment identity shared with fixed packs.
 * A missing key is not payment proof. Malformed, expired, cross-mode, or
 * otherwise unknown keys must never be cleared or overwritten by the UI.
 */
export type PendingCustomCreditCheckout =
  | Readonly<{kind:"none"}>
  | Readonly<{kind:"resumable"; amountUsdMinor:number}>
  | Readonly<{kind:"requires-verification"}>;
export function inspectPendingCustomCreditCheckout(input:Readonly<{
  storage:Pick<Storage,"getItem">; now:number;
}>):PendingCustomCreditCheckout {
  if(!Number.isSafeInteger(input.now)||input.now<0)return {kind:"requires-verification"};
  let raw:string|null;
  try {raw=input.storage.getItem(STORAGE_KEY);}
  catch {return {kind:"requires-verification"};}
  if(raw===null)return {kind:"none"};
  let value:unknown;
  try {value=JSON.parse(raw);} catch {return {kind:"requires-verification"};}
  if(!value||typeof value!=="object"||Array.isArray(value))return {kind:"requires-verification"};
  const saved=value as Record<string,unknown>;
  if(saved.purchaseKind!=="custom"||saved.mode!=="sandbox-only"||
     typeof saved.amountUsdMinor!=="number"||!Number.isSafeInteger(saved.amountUsdMinor)||
     saved.amountUsdMinor<500||saved.amountUsdMinor>50000||
     typeof saved.id!=="string"||!ATTEMPT_ID.test(saved.id)||
     typeof saved.time!=="number"||!Number.isSafeInteger(saved.time)||
     saved.time<0||input.now<saved.time||input.now-saved.time>=TTL_MS)
    return {kind:"requires-verification"};
  return {kind:"resumable",amountUsdMinor:saved.amountUsdMinor};
}

/** Recover an identity even after its UI retry TTL. The server, NOT this
 * record, establishes whether the Stripe session is safely expired/unpaid. */
export type CustomCheckoutRecoveryIdentity=Readonly<{id:string;amountUsdMinor:number}>;
export function readCustomCheckoutRecoveryIdentity(storage:Pick<Storage,"getItem">):
  CustomCheckoutRecoveryIdentity|null{
  let raw:string|null;
  try{raw=storage.getItem(STORAGE_KEY);}catch{return null;}
  if(!raw)return null;
  let value:unknown;
  try{value=JSON.parse(raw);}catch{return null;}
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const saved=value as Record<string,unknown>;
  if(saved.mode!=="sandbox-only"||saved.purchaseKind!=="custom"||
     typeof saved.id!=="string"||!ATTEMPT_ID.test(saved.id)||
     typeof saved.amountUsdMinor!=="number"||!Number.isSafeInteger(saved.amountUsdMinor)||
     saved.amountUsdMinor<500||saved.amountUsdMinor>50000||
     typeof saved.time!=="number"||!Number.isSafeInteger(saved.time)||saved.time<0)
    return null;
  return {id:saved.id,amountUsdMinor:saved.amountUsdMinor};
}
/** Called ONLY after a new server-verified release response. Fail closed if
 * the browser identity changed between verification and removal. */
export function releaseVerifiedCustomCheckoutIdentity(storage:Pick<Storage,"getItem"|"removeItem">,
  verified:CustomCheckoutRecoveryIdentity):boolean{
  const current=readCustomCheckoutRecoveryIdentity(storage);
  if(!current||current.id!==verified.id||current.amountUsdMinor!==verified.amountUsdMinor)return false;
  try{storage.removeItem(STORAGE_KEY);return storage.getItem(STORAGE_KEY)===null;}catch{return false;}
}


/** Recover a historical FIXED pack using the same original attempt identity.
 * Missing mode is allowed only for the old sandbox V1 shape; the server
 * independently proves that the session belongs to a TEST Stripe customer. */
export type AnyCheckoutRecoveryIdentity =
  | (CustomCheckoutRecoveryIdentity & Readonly<{purchaseKind:"custom"}>)
  | Readonly<{purchaseKind:"fixed";id:string;priceId:string}>;
const FIXED_PRICE=/^price_[A-Za-z0-9_]+$/;
export function readAnyCheckoutRecoveryIdentity(storage:Pick<Storage,"getItem">):
  AnyCheckoutRecoveryIdentity|null {
  const custom=readCustomCheckoutRecoveryIdentity(storage);
  if(custom)return {...custom,purchaseKind:"custom"};
  let raw:string|null;
  try{raw=storage.getItem(STORAGE_KEY);}catch{return null;}
  if(!raw)return null;
  let value:unknown;
  try{value=JSON.parse(raw);}catch{return null;}
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const saved=value as Record<string,unknown>;
  if(saved.purchaseKind!==undefined || (saved.mode!==undefined&&saved.mode!=="sandbox-only") ||
     typeof saved.priceId!=="string"||!FIXED_PRICE.test(saved.priceId)||
     typeof saved.id!=="string"||!ATTEMPT_ID.test(saved.id)||
     typeof saved.time!=="number"||!Number.isSafeInteger(saved.time)||saved.time<0||
     saved.amountUsdMinor!==undefined)return null;
  return {purchaseKind:"fixed",id:saved.id,priceId:saved.priceId};
}

/** Retire only the identity which a fresh Web/Stripe status and release response
 * verified. No local-only bypass of the persistent checkout record. */
export function releaseVerifiedAnyCheckoutIdentity(storage:Pick<Storage,"getItem"|"removeItem">,
  verified:AnyCheckoutRecoveryIdentity):boolean {
  const current=readAnyCheckoutRecoveryIdentity(storage);
  if(!current||current.purchaseKind!==verified.purchaseKind||current.id!==verified.id)return false;
  if(current.purchaseKind==="custom" && verified.purchaseKind==="custom" &&
     current.amountUsdMinor!==verified.amountUsdMinor)return false;
  if(current.purchaseKind==="fixed" && verified.purchaseKind==="fixed" &&
     current.priceId!==verified.priceId)return false;
  try{storage.removeItem(STORAGE_KEY);return storage.getItem(STORAGE_KEY)===null;}catch{return false;}
}

/** Preserve Stripe's complete original Checkout URL, including its fragment.
 * The fragment is legitimate Stripe session data; the host must still match exactly.
 * Called only on URLs delivered by the authenticated Web billing authority. */
export function trustedStripeCheckoutUrl(value:unknown):string|null{
  if(typeof value!=="string")return null;
  try{
    const target=new URL(value);
    if(target.protocol!=="https:"||target.hostname!=="checkout.stripe.com"||
       target.username||target.password)return null;
    return target.href;
  }catch{return null;}
}
