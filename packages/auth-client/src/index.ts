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
