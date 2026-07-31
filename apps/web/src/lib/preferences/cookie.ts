import {
  APP_PREFERENCES_COOKIE_NAME,
  serializePreferencesCookieValue,
  type AppPreferences,
} from "@zoeskoul/preferences";

const ONE_YEAR_SECONDS = 31_536_000;

function cookieAttributes(request: Request): string {
  const hostname = new URL(request.url).hostname;
  const productionHost =
    hostname === "zoeskoul.com" || hostname.endsWith(".zoeskoul.com");

  return [
    "Path=/",
    `Max-Age=${ONE_YEAR_SECONDS}`,
    "SameSite=Lax",
    ...(productionHost ? ["Domain=zoeskoul.com", "Secure"] : []),
  ].join("; ");
}

export function mirrorPreferencesCookies(
  request: Request,
  response: Response,
  preferences: AppPreferences,
): Response {
  const attributes = cookieAttributes(request);

  // This cookie is intentionally not HttpOnly: Vite apps read this
  // non-sensitive display snapshot before their first authenticated fetch.
  response.headers.append(
    "Set-Cookie",
    `${APP_PREFERENCES_COOKIE_NAME}=${serializePreferencesCookieValue(preferences)}; ${attributes}`,
  );
  response.headers.append(
    "Set-Cookie",
    `NEXT_LOCALE=${preferences.locale}; ${attributes}`,
  );
  return response;
}
