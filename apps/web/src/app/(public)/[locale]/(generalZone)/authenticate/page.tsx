import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { resolveRequestedAuthCallback } from "@/lib/auth/resolveAuthRedirect";
import AuthenticateClient from "./AuthenticateClient";

type AuthPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    callbackUrl?: string | string[];
    error?: string | string[];
  }>;
};

/**
 * Web is the only identity authority. The server validates the requested
 * destination before sending it to Auth.js or performing an existing-session
 * redirect. This avoids client/server allow-list drift and preserves deep links.
 */
export default async function AuthenticatePage({
  params,
  searchParams,
}: AuthPageProps) {
  const [{ locale }, query, session] = await Promise.all([
    params,
    searchParams,
    auth(),
  ]);
  const callbackUrl = resolveRequestedAuthCallback({
    rawCallbackUrl:
      typeof query.callbackUrl === "string" ? query.callbackUrl : null,
    locale,
    includeLocalApps: process.env.NODE_ENV !== "production",
  });

  if (session?.user) {
    redirect(callbackUrl);
  }

  return <AuthenticateClient callbackUrl={callbackUrl} />;
}
