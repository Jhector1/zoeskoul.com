/**
 * DEV ONLY: scoped local-DB reset for the TWO previously verified Stripe sandbox
 * subscription IDs. Does not call Stripe, alter payment records, or change code.
 * Preserves processed StripeEvent rows to prevent replay of previously handled events.
 */
import { getPrismaClient, FeatureKey } from "../src/client";

const IDS = [
  "sub_1U78uXQ7NgL1u0bJgBs5YqkW", // historical Zoéskoul Founder Yearly
  "sub_1USzr7Q7NgL1u0bJDknsAzTb", // historical ZoeBuild AI Monthly
] as const;
const CONFIRM = "DELETE_ONLY_THE_TWO_SANDBOX_SUBSCRIPTIONS";

function flag(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
function validateTarget(): void {
  if (process.env.NODE_ENV === "production") throw Error("PRODUCTION_RUNTIME_REFUSED");
  const raw = process.env.ADMIN_DATABASE_URL ?? process.env.WEB_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw Error("MISSING_DATABASE_CONFIGURATION");
  const u = new URL(raw);
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") throw Error("POSTGRES_REQUIRED");
  const db = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!db || db.includes("/")) throw Error("BAD_DATABASE_NAME");
  if (u.searchParams.has("schema") && u.searchParams.get("schema") !== "public") throw Error("UNEXPECTED_DATABASE_SCHEMA");
  if (!flag("--expect-host") || !flag("--expect-database")) throw Error("EXPLICIT_TARGET_REQUIRED");
  if (u.hostname !== flag("--expect-host") || db !== flag("--expect-database")) throw Error("DATABASE_TARGET_MISMATCH");
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1" && u.hostname !== "::1")
    throw Error("NOT_A_LOOPBACK_CONNECTION");
  // localhost can be an SSH tunnel to a remote/prod database: human must independently verify target.
  if (!process.argv.includes("--confirmed-disposable-test-db"))
    throw Error("TEST_DATABASE_ATTESTATION_REQUIRED");
}

type Client = ReturnType<typeof getPrismaClient>;
async function inspect(db: Client) {
  const subscriptions = await db.subscription.findMany({
    where: { stripeSubscriptionId: { in: [...IDS] } },
    select: { stripeSubscriptionId:true,userId:true,stripeCustomerId:true,billingProduct:true,status:true },
  });
  if (subscriptions.length === 0) return null; // clean repeat is harmless
  if (subscriptions.length !== IDS.length) throw Error("EXPECTED_BOTH_SUBSCRIPTIONS_OR_NEITHER");
  const userId = subscriptions[0]!.userId;
  const customerId = subscriptions[0]!.stripeCustomerId;
  if (!userId || !customerId || subscriptions.some(s => s.userId !== userId || s.stripeCustomerId !== customerId))
    throw Error("SUBSCRIPTION_OWNER_MISMATCH");
  const [user, otherCount, liveEventCount, grantCount, eventCount] = await Promise.all([
    db.user.findUnique({where:{id:userId},select:{stripeCustomerId:true}}),
    db.subscription.count({where:{userId,stripeSubscriptionId:{notIn:[...IDS]}}}),
    db.stripeEvent.count({where:{subscriptionId:{in:[...IDS]},livemode:true}}),
    db.featureGrant.count({where:{userId,type:"subscription",feature:{in:[FeatureKey.build_ai_generate,FeatureKey.build_ai_edit]}}}),
    db.stripeEvent.count({where:{subscriptionId:{in:[...IDS]}}}),
  ]);
  if (user?.stripeCustomerId !== customerId) throw Error("CUSTOMER_OWNERSHIP_MISMATCH");
  if (otherCount) throw Error("OTHER_SUBSCRIPTIONS_EXIST_FOR_USER_REFUSING_TO_CLEAR_GRANTS");
  if (liveEventCount) throw Error("LIVE_MODE_EVENTS_FOUND_REFUSING_RESET");
  return {userId,grantCount,eventCount,subscriptionCount:subscriptions.length};
}

async function main() {
  validateTarget();
  const apply = process.argv.includes("--apply");
  if (!apply && !process.argv.includes("--preview")) throw Error("CHOOSE_PREVIEW_OR_APPLY");
  if (apply && process.argv.includes("--preview")) throw Error("CHOOSE_ONE_MODE");
  if (apply && flag("--confirm") !== CONFIRM) throw Error("EXACT_DELETION_CONFIRMATION_REQUIRED");
  process.env.PRISMA_QUERY_LOG = "false";
  const db = getPrismaClient();
  try {
    const before = await inspect(db);
    console.log("=== TWO-SUBSCRIPTION DEVELOPMENT DATABASE RESET ===");
    console.log("STRIPE_API_CALLS=NO SCHEMA_MIGRATION=NO");
    console.log("MODE=" + (apply ? "APPLY" : "PREVIEW"));
    if (!before) { console.log("ALREADY_EMPTY=YES"); return; }
    console.log("TARGET_SUBSCRIPTIONS=" + before.subscriptionCount);
    console.log("BUILDER_SUBSCRIPTION_GRANTS=" + before.grantCount);
    console.log("PRESERVED_STRIPE_EVENTS=" + before.eventCount);
    console.log("USER_AND_PROJECTS_PRESERVED=YES");
    if (!apply) { console.log("PREVIEW_PASS_NO_WRITES"); return; }
    const deleted = await db.$transaction(async tx => {
      // Re-check exact rows and related grants INSIDE the transaction before deletion.
      const subRows = await tx.subscription.findMany({where:{stripeSubscriptionId:{in:[...IDS]}},select:{userId:true,stripeCustomerId:true}});
      if (subRows.length !== 2 || subRows.some(s => s.userId !== before.userId)) throw Error("SUBSCRIPTION_CHANGED_DURING_RESET");
      const other = await tx.subscription.count({where:{userId:before.userId,stripeSubscriptionId:{notIn:[...IDS]}}});
      if (other) throw Error("NEW_SUBSCRIPTION_APPEARED_REFUSING_RESET");
      const grants = await tx.featureGrant.deleteMany({where:{userId:before.userId,type:"subscription",feature:{in:[FeatureKey.build_ai_generate,FeatureKey.build_ai_edit]}}});
      const subs = await tx.subscription.deleteMany({where:{stripeSubscriptionId:{in:[...IDS]},userId:before.userId}});
      if (subs.count !== 2) throw Error("UNEXPECTED_SUBSCRIPTION_DELETE_COUNT");
      await tx.user.update({where:{id:before.userId},data:{billingCheckoutAttemptId:null,billingCheckoutReservedAt:null}});
      return {subCount:subs.count,grantCount:grants.count};
    }, {isolationLevel:"Serializable",timeout:15000});
    console.log("SUBSCRIPTIONS_DELETED="+deleted.subCount);
    console.log("BUILDER_GRANTS_DELETED="+deleted.grantCount);
    console.log("STRIPE_EVENT_LEDGER_PRESERVED=YES");
    console.log("DATABASE_SCOPED_RESET_PASS");
    console.log("WARNING_STRIPE_SUBSCRIPTIONS_STILL_EXIST=YES");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => { console.error("RESET_ABORTED: verify disposable DB, IDs, owners and current state locally; no secrets printed"); process.exitCode = 2; });
