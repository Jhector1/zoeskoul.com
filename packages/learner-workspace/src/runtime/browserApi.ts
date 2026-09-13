import {
  createApiClient,
  type ApiClient,
} from "@zoeskoul/api-client";

let cachedOrigin: string | null = null;
let cachedClient: ApiClient | null = null;

function currentOrigin(): string {
  if (typeof window === "undefined") {
    throw new Error("Learner workspace API requests require a browser origin.");
  }
  return window.location.origin;
}

function client(): ApiClient {
  const origin = currentOrigin();
  if (!cachedClient || cachedOrigin !== origin) {
    cachedOrigin = origin;
    cachedClient = createApiClient({ baseOrigin: origin });
  }
  return cachedClient;
}

export function learnerWorkspaceApiRaw(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return client().raw(path, init);
}
