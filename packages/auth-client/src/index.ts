import {
  isAppSessionResponse,
  type AppSessionResponse,
} from "@zoeskoul/api-contracts";
import type { ApiClientOptions } from "@zoeskoul/api-client";

export type {
  AppCapability,
  AppSessionResponse,
  AppSessionUser,
} from "@zoeskoul/api-contracts";

export class AuthClientError extends Error {
  readonly kind:
    | "http"
    | "network"
    | "invalid_json"
    | "invalid_payload";
  readonly status?: number;
  readonly payload?: unknown;

  constructor(args: {
    message: string;
    kind:
      | "http"
      | "network"
      | "invalid_json"
      | "invalid_payload";
    status?: number;
    payload?: unknown;
  }) {
    super(args.message);
    this.name = "AuthClientError";
    this.kind = args.kind;
    this.status = args.status;
    this.payload = args.payload;
  }
}

export type AuthClientOptions = {
  apiOrigin: string;
  fetchImpl?: ApiClientOptions["fetchImpl"];
};

export type AuthenticateUrlOptions = {
  websiteOrigin: string;
  callbackUrl: string;
  locale?: string;
};

export type LogoutUrlOptions = {
  websiteOrigin: string;
  locale?: string;
};

function normalizeLocale(locale: string | undefined): string {
  const normalized = locale?.trim().toLowerCase();
  return normalized &&
    ["en", "es", "fr", "ht"].includes(
      normalized,
    )
    ? normalized
    : "en";
}

function readErrorMessage(
  payload: unknown,
  status: number,
): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return `API request failed with status ${status}.`;
}

async function readSessionPayload(
  response: Response,
): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AuthClientError({
      message: "The app session response was not valid JSON.",
      kind: "invalid_json",
      status: response.status,
      payload: text,
    });
  }
}

async function readErrorPayload(
  response: Response,
): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function buildAuthenticateUrl(
  options: AuthenticateUrlOptions,
): string {
  const locale = normalizeLocale(options.locale);
  const url = new URL(`/${locale}/authenticate`, options.websiteOrigin);
  url.searchParams.set("callbackUrl", options.callbackUrl);
  return url.toString();
}

export function buildLogoutUrl(
  options: LogoutUrlOptions,
): string {
  const locale = normalizeLocale(options.locale);
  const websiteOrigin =
    new URL(options.websiteOrigin).origin;
  const url = new URL(
    "/api/auth/logout",
    websiteOrigin,
  );

  url.searchParams.set(
    "postLogoutRedirect",
    new URL(`/${locale}`, websiteOrigin)
      .toString(),
  );
  url.searchParams.set("locale", locale);

  return url.toString();
}

export function createAuthClient(options: AuthClientOptions) {
  const baseOrigin = new URL(options.apiOrigin).origin;
  const fetchImpl =
    options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  return {
    async fetchSession(signal?: AbortSignal): Promise<AppSessionResponse> {
      let response: Response;

      try {
        response = await fetchImpl(
          new URL("/api/app-session", baseOrigin),
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            headers: {
              Accept: "application/json",
            },
            signal,
          },
        );
      } catch (error: unknown) {
        throw new AuthClientError({
          message:
            error instanceof Error
              ? error.message
              : "The session request failed.",
          kind: "network",
        });
      }

      if (!response.ok) {
        const payload =
          await readErrorPayload(response);

        throw new AuthClientError({
          message: readErrorMessage(
            payload,
            response.status,
          ),
          kind: "http",
          status: response.status,
          payload,
        });
      }

      const session =
        await readSessionPayload(response);

      if (!isAppSessionResponse(session)) {
        throw new AuthClientError({
          message: "The app session response was invalid.",
          kind: "invalid_payload",
          payload: session,
        });
      }

      return session;
    },
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
