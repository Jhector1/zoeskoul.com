export type ApiRequestInit = Omit<
  RequestInit,
  "body" | "credentials"
> & {
  body?: BodyInit | null;
  json?: unknown;
};

export type ApiClientOptions = {
  baseOrigin: string;
  fetchImpl?: typeof globalThis.fetch;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(args: {
    message: string;
    status: number;
    payload: unknown;
  }) {
    super(args.message);
    this.name = "ApiClientError";
    this.status = args.status;
    this.payload = args.payload;
  }
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return fallback;
}

export function createApiClient(options: ApiClientOptions) {
  const baseOrigin = new URL(options.baseOrigin).origin;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  return {
    async request<T>(
      path: string,
      init: ApiRequestInit = {},
    ): Promise<T> {
      if (!path.startsWith("/")) {
        throw new Error("API paths must start with '/'.");
      }

      if (init.body !== undefined && init.json !== undefined) {
        throw new Error("Use either body or json, not both.");
      }

      const url = new URL(path, baseOrigin);

      if (url.origin !== baseOrigin) {
        throw new Error("Cross-origin API path overrides are not allowed.");
      }

      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");

      let body = init.body;

      if (init.json !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(init.json);
      }

      const response = await fetchImpl(url, {
        ...init,
        body,
        credentials: "include",
        headers,
      });

      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw new ApiClientError({
          message: readErrorMessage(
            payload,
            `API request failed with status ${response.status}.`,
          ),
          status: response.status,
          payload,
        });
      }

      return payload as T;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function toWebSocketUrl(input: string) {
    const url = new URL(input, window.location.href);

    if (url.protocol === "http:" || url.protocol === "ws:") {
        url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    } else if (url.protocol === "https:" || url.protocol === "wss:") {
        url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    }
    return url.toString();
}
