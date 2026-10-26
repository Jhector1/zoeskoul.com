/**
 * Local-only diagnosis and short-lived AI edit trial for ONE named test account.
 * Invocation is guarded by zoebuild-local-ai-edit-access.py (local DB preflight).
 * No build entitlement checks, provider settings, or billing policy are changed.
 */
import { FeatureKey } from "@zoeskoul/db";
import { prisma } from "@zoeskoul/platform-server/prisma";
import {
  canonicalUserActorKey,
  deterministicFeatureGrantId,
  reconcileFeatureGrant,
} from "@zoeskoul/platform-server/access/reconcileFeatureGrant";

const action = process.argv[2];
const email = process.argv[3]?.trim();
if ((action !== "--inspect" && action !== "--grant-local") ||
    !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Specify --inspect or --grant-local and one account email.");
}
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("REFUSE_DATABASE_URL_MISSING");
const parsed = new URL(dbUrl);
if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.port !== "5432" ||
    decodeURIComponent(parsed.pathname) !== "/learnoir_db") {
  throw new Error("REFUSE_NONLOCAL_DATABASE");
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email }, select: { id: true, roles: true },
  });
  if (!user) throw new Error("LOCAL_ACCOUNT_NOT_FOUND: check the email signed into ZoeBuild");
  const now = new Date();
  const grants = await prisma.featureGrant.findMany({
    where: {userId: user.id, feature: {in: [FeatureKey.build_ai_edit, FeatureKey.build_ai_generate]}},
    select: {id: true, feature: true, type: true, startsAt: true, endsAt: true, revokedAt: true},
  });
  const active = (item: typeof grants[number]) =>
    !item.revokedAt && (!item.startsAt || item.startsAt <= now) &&
    (!item.endsAt || item.endsAt > now);
  const report = () => ({
    userId: user.id,
    roles: user.roles,
    aiEditEnabled: grants.some(g => g.feature === FeatureKey.build_ai_edit && active(g)),
    aiGenerateEnabled: grants.some(g => g.feature === FeatureKey.build_ai_generate && active(g)),
    grants: grants.map(g => ({feature: g.feature, type: g.type, active: active(g), endsAt: g.endsAt})),
  });
  console.log("LOCAL_ZOEBUILD_ENTITLEMENT", JSON.stringify(report(), null, 2));
  if (action === "--inspect") return;

  // A local development trial is never a replacement for paid production access.
  if (process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT === "required") {
    throw new Error("REFUSE_UNMETERED_EDIT: required credit enforcement needs real route integration");
  }
  const grantId = deterministicFeatureGrantId({
    userId: user.id, feature: FeatureKey.build_ai_edit, type: "trial",
  });
  const prior = await prisma.featureGrant.findUnique({
    where: {id: grantId}, select: {meta: true},
  });
  const meta = prior?.meta;
  if (prior && (!meta || typeof meta !== "object" || Array.isArray(meta) ||
      !("source" in meta) || meta.source !== "zoebuild_local_edit_test")) {
    throw new Error("REFUSE_EXISTING_TRIAL_OWNER: an unrelated trial grant owns this slot");
  }
  const expires = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  await reconcileFeatureGrant({
    client: prisma,
    userId: user.id,
    actorKey: canonicalUserActorKey(user.id),
    feature: FeatureKey.build_ai_edit,
    type: "trial",
    active: true,
    startsAt: now,
    endsAt: expires,
    meta: { source: "zoebuild_local_edit_test", environment: "local-dev", purpose: "manual hero edit smoke test" },
  });
  console.log("LOCAL_DEV_AI_EDIT_TRIAL_ENABLED", JSON.stringify({userId: user.id, expiresAt: expires.toISOString()}));
  console.log("Refresh your ZoeBuild page; no AI provider calls have been made by this helper.");
}

main().catch(error => {
  console.error("LOCAL_EDIT_ACCESS_FAILED:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
