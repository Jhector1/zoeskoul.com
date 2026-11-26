import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getLocalAppOrigin,
  getProductionAppOrigin,
} from "@zoeskoul/app-config";

import HomePageAvatarOnboardingServer from "@/components/home/onboarding/HomePageAvatarOnboardingServer";
import { resolveAuthRedirect } from "@/lib/auth/resolveAuthRedirect";
import { getActor } from "@/lib/practice/actor";
import {
  claimGuestOnboardingForUser,
  getOnboardingProfile,
} from "@/lib/onboarding/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up your ZoeSkoul workspace",
  robots: {
    index: false,
    follow: false,
  },
};

function runtimeOrigin(app: "website" | "student") {
  return process.env.NODE_ENV === "production"
    ? getProductionAppOrigin(app)
    : getLocalAppOrigin(app);
}

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    returnTo?: string | string[];
    edit?: string | string[];
  }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const actor = await getActor();
  const userId = actor.userId;
  const websiteOrigin = runtimeOrigin("website");
  const defaultReturnTo = new URL(`/${locale}/subjects`, runtimeOrigin("student")).toString();
  const rawReturnTo = Array.isArray(query.returnTo)
    ? query.returnTo[0]
    : query.returnTo;
  const rawEdit = Array.isArray(query.edit) ? query.edit[0] : query.edit;
  const editing = rawEdit === "1";
  const completionHref = resolveAuthRedirect({
    url: rawReturnTo || defaultReturnTo,
    baseUrl: websiteOrigin,
    includeLocalApps: process.env.NODE_ENV !== "production",
    fallbackPath: `/${locale}`,
  });

  if (!userId) {
    const callbackUrl = new URL(`/${locale}/onboarding`, websiteOrigin);
    callbackUrl.searchParams.set("returnTo", completionHref);
    if (editing) callbackUrl.searchParams.set("edit", "1");
    const authenticateUrl = new URL(`/${locale}/authenticate`, websiteOrigin);
    authenticateUrl.searchParams.set("callbackUrl", callbackUrl.toString());
    redirect(authenticateUrl.toString());
  }

  if (actor.guestId) {
    await claimGuestOnboardingForUser({
      guestId: actor.guestId,
      userId,
    });
  }

  const profile = await getOnboardingProfile({ userId, guestId: null });
  if (!editing && (profile?.completedAt || profile?.skippedAt)) {
    redirect(completionHref);
  }

  return (
    <HomePageAvatarOnboardingServer
      locale={locale}
      forceOnboarding
      completionHref={completionHref}
    />
  );
}
