import {
  isAppSessionResponse,
  type AppSessionResponse,
} from "@zoeskoul/api-contracts";
import {
  createApiClient,
  type ApiClientOptions,
} from "@zoeskoul/api-client";

export type {
  AppSessionResponse,
  AppSessionUser,
} from "@zoeskoul/api-contracts";

export type AuthClientOptions = {
  apiOrigin: string;
  fetchImpl?: ApiClientOptions["fetchImpl"];
};

export type AuthenticateUrlOptions = {
  websiteOrigin: string;
  callbackUrl: string;
  locale?: string;
};

function normalizeLocale(locale: string | undefined): string {
  const normalized = locale?.trim().toLowerCase();
  return normalized && /^[a-z]{2}(?:-[a-z]{2})?$/.test(normalized)
    ? normalized
    : "en";
}

export function buildAuthenticateUrl(
  options: AuthenticateUrlOptions,
): string {
  const locale = normalizeLocale(options.locale);
  const url = new URL(`/${locale}/authenticate`, options.websiteOrigin);
  url.searchParams.set("callbackUrl", options.callbackUrl);
  return url.toString();
}

export function createAuthClient(options: AuthClientOptions) {
  const api = createApiClient({
    baseOrigin: options.apiOrigin,
    fetchImpl: options.fetchImpl,
  });

  return {
    async fetchSession(signal?: AbortSignal): Promise<AppSessionResponse> {
      const session = await api.request<unknown>("/api/app-session", {
        method: "GET",
        cache: "no-store",
        signal,
      });

      if (!isAppSessionResponse(session)) {
        throw new Error("The app session response was invalid.");
      }

      return session;
    },
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
