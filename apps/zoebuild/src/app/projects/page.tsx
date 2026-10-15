import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  APP_PREFERENCES_COOKIE_NAME,
  DEFAULT_APP_PREFERENCES,
  parsePreferencesCookieValue,
} from "@zoeskoul/preferences";

export default async function ZoeBuildProjectsRedirect() {
  const cookieStore = await cookies();
  const locale =
    parsePreferencesCookieValue(
      cookieStore.get(
        APP_PREFERENCES_COOKIE_NAME,
      )?.value,
    )?.locale ??
    DEFAULT_APP_PREFERENCES.locale;

  redirect(`/${locale}/projects`);
}
