import "server-only";

import { redirect } from "next/navigation";
import { getTeachingPageAccess, type TeachingUser } from "./teachingAccess";
import { resolveTeachingPageRedirect } from "./teachingPageAccess";

/**
 * Shared App Router guard for every private-course teaching page.
 * Signed-in learners go back to their own assigned-courses page; signed-out
 * visitors sign in and return to the requested localized teaching route.
 */
export async function requireTeachingPageUser(args: {
  locale?: string | null;
  callbackPath?: string;
} = {}): Promise<TeachingUser> {
  const access = await getTeachingPageAccess();
  const target = resolveTeachingPageRedirect({
    authenticated: access.authenticated,
    allowed: Boolean(access.teachingUser),
    locale: args.locale,
    callbackPath: args.callbackPath,
  });

  if (target) redirect(target);
  return access.teachingUser as TeachingUser;
}
