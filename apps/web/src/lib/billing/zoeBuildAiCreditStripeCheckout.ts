import { createHash } from "node:crypto";
import { quoteZoeTopUpUsdMinor, ZOE_TOP_UP_POLICY, ZOE_CUSTOM_TOPUP_MARKER } from "@zoeskoul/platform-server/ai-credits/customCreditTopUp";
import {
  creditFundingIsLive,
  validatedPackCatalog,
  ZoeBuildAiCreditFundingError,
  type ApprovedZoeBuildCreditPack,
  type CreditFundingMode,
} from "./zoeBuildAiCreditStripeFunding";

/**
 * Trusted SERVER-ONLY Stripe Checkout preparation for both provider modes.
 * Callers must authenticate the user, authorize purchase access, and supply
 * a server-approved app origin; never expose these deps to a public endpoint.
 * Live Checkout is guarded by its independently reviewed pack registry.
 */
export type ZoeBuildCreditCheckoutPrice = Readonly<{
  id: string;
  livemode: boolean;
  active: boolean;
  type: string;
  currency: string;
  unitAmount: number | null;
  billingScheme: string;
  recurring: boolean;
  customUnitAmount: boolean;
}>;
export type ZoeBuildCreditCheckoutCustomer = Readonly<{
  id: string;
  livemode: boolean | null;
  deleted: boolean;
}>;
export type ZoeBuildCreditCheckoutSession = Readonly<{
  id: string;
  livemode: boolean;
  mode: string;
  status: string;
  customer: string | null;
  url: string | null;
  metadata: Readonly<Record<string, string>> | null;
}>;
export type ZoeBuildCreditCheckoutLine = Readonly<{
  quantity: number | null;
  priceId: string | null;
  amountSubtotal: number;
}>;
export type ZoeBuildCreditCheckoutDeps = Readonly<{
  retrievePrice(id: string): Promise<ZoeBuildCreditCheckoutPrice>;
  findCustomerForUser(userId: string): Promise<string | null>;
  retrieveCustomer(id: string): Promise<ZoeBuildCreditCheckoutCustomer>;
  claimAttempt(input: Readonly<{attemptId: string; userId: string; priceId: string;
    customerId: string}>): Promise<{claimed: boolean; stripeSessionId: string | null}>;
  recordSession(input: Readonly<{attemptId: string; userId: string; priceId: string;
    customerId: string; stripeSessionId: string}>): Promise<{recorded: boolean}>;
  retrieveSession(sessionId: string): Promise<ZoeBuildCreditCheckoutSession>;
  listSessions(customerId: string): Promise<Readonly<{
    data: readonly ZoeBuildCreditCheckoutSession[]; hasMore: boolean;
  }>>;
  listLineItems(sessionId: string): Promise<Readonly<{
    data: readonly ZoeBuildCreditCheckoutLine[]; hasMore: boolean;
  }>>;
  createSession(input: ZoeBuildCreditCheckoutCreateParams, idempotencyKey: string): Promise<ZoeBuildCreditCheckoutSession>;
}>;
export type ZoeBuildCreditCheckoutCreateParams = Readonly<{
  mode: "payment";
  customer: string;
  priceId: string;
  quantity: 1;
  metadata: Readonly<{ zoebuildAiCreditPurchase: "v1"; checkoutAttemptId: string; creditPackPriceId: string }>;
  successUrl: string;
  cancelUrl: string;
}>;
export type ZoeBuildCreditCheckoutResult = Readonly<{
  sessionId: string;
  url: string | null;
  status: "open" | "complete";
  created: boolean;
}>;

const USER_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,159}$/;
const ATTEMPT = /^zb-ai-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const CUSTOMER_ID = /^cus_[A-Za-z0-9_]+$/;
const SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;

function refuse(code: string): never { throw new ZoeBuildAiCreditFundingError(code); }

function validatedOrigin(value: string): string {
  if (typeof value !== "string") refuse("AI_CREDIT_CHECKOUT_ORIGIN_INVALID");
  let url: URL;
  try { url = new URL(value); } catch { return refuse("AI_CREDIT_CHECKOUT_ORIGIN_INVALID"); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    refuse("AI_CREDIT_CHECKOUT_ORIGIN_INVALID");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "zoeskoul.com" && !host.endsWith(".zoeskoul.com") &&
      host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]")
    refuse("AI_CREDIT_CHECKOUT_ORIGIN_INVALID");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    refuse("AI_CREDIT_CHECKOUT_ORIGIN_INVALID");
  return url.origin;
}

function exactSession(session: ZoeBuildCreditCheckoutSession, id: string, customer: string,
  attempt: string, price: string, live: boolean): boolean {
  return session.id === id && SESSION_ID.test(session.id) &&
    session.livemode === live && session.id.startsWith(live ? "cs_live_" : "cs_test_") &&
    session.mode === "payment" &&
    session.customer === customer &&
    session.metadata?.zoebuildAiCreditPurchase === "v1" &&
    session.metadata?.checkoutAttemptId === attempt &&
    session.metadata?.creditPackPriceId === price &&
    (session.status === "open" || session.status === "complete" || session.status === "expired");
}

/**
 * Creates/reuses a mode-bound Checkout for an approved price and one
 * authenticated user's existing Stripe customer. A reused expired attempt is
 * rejected; never silently create a second session for the same attempt.
 * Stripe's own idempotency key also protects concurrent/retried creation.
 */
export async function createZoeBuildAiCreditTestCheckout(input: Readonly<{
  deps: ZoeBuildCreditCheckoutDeps;
  userId: string;
  priceId: string;
  checkoutAttemptId: string;
  appOrigin: string;
  mode: CreditFundingMode;
  approvedPacks: readonly ApprovedZoeBuildCreditPack[];
}>): Promise<ZoeBuildCreditCheckoutResult> {
  const live=creditFundingIsLive(input.mode);
  if (live === null) refuse("AI_CREDIT_FUNDING_DISABLED");
  if (!USER_ID.test(input.userId) || !ATTEMPT.test(input.checkoutAttemptId))
    refuse("AI_CREDIT_CHECKOUT_IDENTIFIERS_INVALID");
  const catalog = validatedPackCatalog(input.approvedPacks);
  if (!catalog.size) refuse("AI_CREDIT_PACK_CATALOG_EMPTY");
  const pack = catalog.get(input.priceId);
  if (!pack) refuse("AI_CREDIT_PACK_UNAPPROVED");
  const origin = validatedOrigin(input.appOrigin);

  // Do not create/check a customer until the Stripe PRICE proves the exact
  // Stripe environment, active one-time product and reviewed USD amount.
  const stripePrice = await input.deps.retrievePrice(pack.priceId);
  if (stripePrice.id !== pack.priceId || stripePrice.livemode !== live ||
      stripePrice.active !== true || stripePrice.type !== "one_time" ||
      stripePrice.currency !== "usd" || stripePrice.unitAmount !== pack.amountUsdMinor ||
      stripePrice.billingScheme !== "per_unit" || stripePrice.recurring ||
      stripePrice.customUnitAmount) refuse("AI_CREDIT_CHECKOUT_PRICE_MISMATCH");

  const customerId = await input.deps.findCustomerForUser(input.userId);
  if (!customerId || !CUSTOMER_ID.test(customerId))
    refuse("AI_CREDIT_CHECKOUT_CUSTOMER_NOT_MAPPED");
  const customer = await input.deps.retrieveCustomer(customerId);
  if (customer.id !== customerId || customer.livemode !== live || customer.deleted)
    refuse("AI_CREDIT_CHECKOUT_CUSTOMER_MISMATCH");

  // Persist the attempt BEFORE the remote payment-session creation.
  // An existing unrecorded attempt may recover a known Stripe session, but
  // must NEVER issue a second create request after an uncertain first call.
  const claim = await input.deps.claimAttempt({
    attemptId: input.checkoutAttemptId, userId: input.userId,
    priceId: pack.priceId, customerId,
  });
  const confirmSession = async (found: ZoeBuildCreditCheckoutSession) => {
    if (!exactSession(found, found.id, customerId, input.checkoutAttemptId, pack.priceId, live))
      refuse("AI_CREDIT_CHECKOUT_ATTEMPT_CONFLICT");
    const items = await input.deps.listLineItems(found.id);
    if (items.hasMore || items.data.length !== 1 || items.data[0]?.quantity !== 1 ||
        items.data[0]?.priceId !== pack.priceId ||
        items.data[0]?.amountSubtotal !== pack.amountUsdMinor)
      refuse("AI_CREDIT_CHECKOUT_ATTEMPT_CONFLICT");
    if (found.status === "expired") refuse("AI_CREDIT_CHECKOUT_ATTEMPT_EXPIRED");
    if (found.status === "open" && !found.url)
      refuse("AI_CREDIT_CHECKOUT_URL_MISSING");
    return {sessionId: found.id, url: found.url,
      status: found.status as "open" | "complete", created: false};
  };
  if (claim.stripeSessionId) {
    // Bypass the truncated customer history: the immutable DB reference owns
    // this attempt. Re-check the actual current Stripe Session and line items.
    const found = await input.deps.retrieveSession(claim.stripeSessionId);
    return confirmSession(found);
  }
  const recent = await input.deps.listSessions(customerId);
  if (recent.hasMore || recent.data.length > 100)
    refuse("AI_CREDIT_CHECKOUT_HISTORY_INCOMPLETE");
  const matching = recent.data.filter(row =>
    row.metadata?.checkoutAttemptId === input.checkoutAttemptId &&
    row.metadata?.zoebuildAiCreditPurchase === "v1");
  if (matching.length > 1) refuse("AI_CREDIT_CHECKOUT_ATTEMPT_CONFLICT");
  if (matching.length === 1) {
    const found = matching[0]!;
    const result = await confirmSession(found);
    await input.deps.recordSession({attemptId: input.checkoutAttemptId,
      userId: input.userId, priceId: pack.priceId, customerId,
      stripeSessionId: found.id});
    return result;
  }
  if (!claim.claimed) {
    // The first request may have reached Stripe even if no response came back.
    // Never rely on finite Stripe idempotency retention to retry charging.
    refuse("AI_CREDIT_CHECKOUT_ATTEMPT_UNRESOLVED");
  }

  const metadata = {
    zoebuildAiCreditPurchase: "v1" as const,
    checkoutAttemptId: input.checkoutAttemptId,
    creditPackPriceId: pack.priceId,
  };
  const session = await input.deps.createSession({
    mode: "payment", customer: customerId, priceId: pack.priceId, quantity: 1,
    metadata,
    successUrl: `${origin}/en/billing?credits=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/en/billing?credits=cancelled`,
  }, `zoebuild-ai-credit-checkout-${createHash("sha256")
    .update(`${input.userId}\0${input.checkoutAttemptId}`).digest("hex")}`);
  if (!exactSession(session, session.id, customerId, input.checkoutAttemptId, pack.priceId, live) ||
      session.status !== "open" || !session.url)
    refuse("AI_CREDIT_CHECKOUT_CREATED_SESSION_INVALID");
  // If this DB operation fails, the attempt stays claimed and a replay must
  // locate the existing Stripe Session rather than create a second checkout.
  await input.deps.recordSession({attemptId: input.checkoutAttemptId,
    userId: input.userId, priceId: pack.priceId, customerId,
    stripeSessionId: session.id});
  return {sessionId: session.id, url: session.url, status: "open", created: true};
}


/** Custom Checkout has a separate versioned provenance contract from fixed packs.
 * It deliberately has no live path: a quoted sandbox price is not a reviewed
 * live product or an authorization to charge a live customer. */
export type ZoeBuildCustomCheckoutDeps = ZoeBuildCreditCheckoutDeps & Readonly<{
  claimCustomAttempt(input:Readonly<{attemptId:string;userId:string;customerId:string;
    amountUsdMinor:number}>):Promise<{claimed:boolean;stripeSessionId:string|null}>;
  recordCustomSession(input:Readonly<{attemptId:string;userId:string;customerId:string;
    amountUsdMinor:number;stripeSessionId:string}>):Promise<{recorded:boolean}>;
  createCustomSession(input:Readonly<{mode:"payment";customer:string;amountUsdMinor:number;
    metadata:Readonly<Record<string,string>>;successUrl:string;cancelUrl:string}>,
    idempotencyKey:string):Promise<ZoeBuildCreditCheckoutSession>;
}>;
export async function createZoeBuildAiCustomCheckout(input:Readonly<{
  deps:ZoeBuildCustomCheckoutDeps; userId:string; checkoutAttemptId:string;
  amountUsdMinor:number; appOrigin:string; mode:CreditFundingMode;
  approvedPacks:readonly ApprovedZoeBuildCreditPack[];
}>):Promise<ZoeBuildCreditCheckoutResult> {
  // Separate sandbox authorization. Live custom purchasing is not commercially released.
  if (input.mode!=="sandbox-only") refuse("AI_CREDIT_CUSTOM_TOPUP_NOT_APPROVED");
  if (!USER_ID.test(input.userId)||!ATTEMPT.test(input.checkoutAttemptId))
    refuse("AI_CREDIT_CHECKOUT_IDENTIFIERS_INVALID");
  let quote:ReturnType<typeof quoteZoeTopUpUsdMinor>;
  try { quote=quoteZoeTopUpUsdMinor(input.amountUsdMinor); }
  catch { return refuse("AI_CREDIT_TOPUP_AMOUNT_INVALID"); }
  const catalog=validatedPackCatalog(input.approvedPacks);
  // The reviewed sandbox pack and verified TEST Price anchor funding mode.
  if (catalog.size!==1) refuse("AI_CREDIT_CUSTOM_TOPUP_NOT_APPROVED");
  const anchor=[...catalog.values()][0]!;
  if (anchor.amountUsdMinor!==500 || anchor.creditUnits!=="500000")
    refuse("AI_CREDIT_CUSTOM_TOPUP_NOT_APPROVED");
  const stripePrice=await input.deps.retrievePrice(anchor.priceId);
  if (stripePrice.id!==anchor.priceId || stripePrice.livemode!==false ||
      !stripePrice.active || stripePrice.type!=="one_time" ||
      stripePrice.currency!=="usd" || stripePrice.unitAmount!==500 ||
      stripePrice.billingScheme!=="per_unit" || stripePrice.recurring ||
      stripePrice.customUnitAmount) refuse("AI_CREDIT_CHECKOUT_PRICE_MISMATCH");
  const origin=validatedOrigin(input.appOrigin);
  const customerId=await input.deps.findCustomerForUser(input.userId);
  if (!customerId || !CUSTOMER_ID.test(customerId))
    refuse("AI_CREDIT_CHECKOUT_CUSTOMER_NOT_MAPPED");
  const customer=await input.deps.retrieveCustomer(customerId);
  if (customer.id!==customerId || customer.livemode!==false || customer.deleted)
    refuse("AI_CREDIT_CHECKOUT_CUSTOMER_MISMATCH");
  const attempt={attemptId:input.checkoutAttemptId,userId:input.userId,customerId,
    amountUsdMinor:quote.amountUsdMinor};
  const claim=await input.deps.claimCustomAttempt(attempt);
  const metadata={zoebuildAiCreditPurchase:"v2",checkoutAttemptId:input.checkoutAttemptId,
    purchaseKind:ZOE_CUSTOM_TOPUP_MARKER,amountUsdMinor:String(quote.amountUsdMinor),
    creditUnits:quote.creditUnits,pricingVersion:ZOE_TOP_UP_POLICY.version};
  const confirm=async (session:ZoeBuildCreditCheckoutSession):Promise<ZoeBuildCreditCheckoutResult>=>{
    if (!session.id.startsWith("cs_test_") || !SESSION_ID.test(session.id) ||
        session.livemode!==false || session.mode!=="payment" ||
        session.customer!==customerId ||
        Object.entries(metadata).some(([key,value])=>session.metadata?.[key]!==value) ||
        !["open","complete","expired"].includes(session.status))
      refuse("AI_CREDIT_CHECKOUT_ATTEMPT_CONFLICT");
    const lines=await input.deps.listLineItems(session.id);
    if (lines.hasMore || lines.data.length!==1 || lines.data[0]?.quantity!==1 ||
        !lines.data[0]?.priceId?.startsWith("price_") ||
        lines.data[0]?.amountSubtotal!==quote.amountUsdMinor)
      refuse("AI_CREDIT_CHECKOUT_ATTEMPT_CONFLICT");
    if (session.status==="expired") refuse("AI_CREDIT_CHECKOUT_ATTEMPT_EXPIRED");
    if (session.status==="open"&&!session.url) refuse("AI_CREDIT_CHECKOUT_URL_MISSING");
    return {sessionId:session.id,url:session.url,
      status:session.status as "open"|"complete",created:false};
  };
  if (claim.stripeSessionId)
    return confirm(await input.deps.retrieveSession(claim.stripeSessionId));
  const recent=await input.deps.listSessions(customerId);
  if (recent.hasMore || recent.data.length>100)
    refuse("AI_CREDIT_CHECKOUT_HISTORY_INCOMPLETE");
  const matches=recent.data.filter(s=>s.metadata?.checkoutAttemptId===input.checkoutAttemptId &&
    s.metadata?.zoebuildAiCreditPurchase==="v2");
  if (matches.length>1) refuse("AI_CREDIT_CHECKOUT_ATTEMPT_CONFLICT");
  if (matches.length===1) {
    const found=matches[0]!;
    const resumed=await confirm(found);
    await input.deps.recordCustomSession({...attempt,stripeSessionId:found.id});
    return resumed;
  }
  if (!claim.claimed) refuse("AI_CREDIT_CHECKOUT_ATTEMPT_UNRESOLVED");
  const result=await input.deps.createCustomSession({
    mode:"payment",customer:customerId,amountUsdMinor:quote.amountUsdMinor,
    metadata,
    successUrl:`${origin}/en/billing?credits=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl:`${origin}/en/billing?credits=cancelled`,
  },`zoebuild-ai-credit-custom-checkout-${createHash("sha256")
    .update(`${input.userId}\0${input.checkoutAttemptId}`).digest("hex")}`);
  // Stripe may have accepted a remote session even when DB update fails: never retry blindly.
  if (!result.id.startsWith("cs_test_") || !SESSION_ID.test(result.id) ||
      result.livemode!==false || result.mode!=="payment" ||
      result.status!=="open" || result.customer!==customerId || !result.url ||
      Object.entries(metadata).some(([key,value])=>result.metadata?.[key]!==value))
    refuse("AI_CREDIT_CHECKOUT_CREATED_SESSION_INVALID");
  await input.deps.recordCustomSession({...attempt,stripeSessionId:result.id});
  return {sessionId:result.id,url:result.url,status:"open",created:true};
}
