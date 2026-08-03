import {
  useEffect,
  type ReactNode,
} from "react";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
]);

function isLocalHost(hostname: string) {
  return LOCAL_HOSTS.has(
    hostname.toLowerCase(),
  );
}

export function resolveLegacyApiUrl(args: {
  rawUrl: string;
  browserUrl: string;
  apiOrigin: string;
}) {
  const browser = new URL(args.browserUrl);
  const requested = new URL(
    args.rawUrl,
    browser,
  );

  const isRelativeStudentApi =
    requested.origin === browser.origin &&
    requested.pathname.startsWith("/api/");

  if (!isRelativeStudentApi) {
    return args.rawUrl;
  }

  const api = new URL(
    args.apiOrigin,
    browser,
  );

  /*
   * Local development already has a Vite /api proxy.
   *
   * Keeping the request on localhost:3002 lets Vite forward it to
   * localhost:3000 as a same-origin browser request. Rewriting it directly
   * to port 3000 bypasses that proxy and forces every old Next API route to
   * implement CORS individually. That caused module navigation to fail and
   * made generated exercises repeatedly enter the full loading state.
   */
  if (
    isLocalHost(browser.hostname) &&
    isLocalHost(api.hostname)
  ) {
    return (
      requested.pathname +
      requested.search +
      requested.hash
    );
  }

  return new URL(
    requested.pathname +
      requested.search +
      requested.hash,
    api,
  ).toString();
}

export function LegacyApiBridge(props: {
  apiOrigin: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const nativeFetch =
      window.fetch.bind(window);

    window.fetch = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const rewrite = (raw: string) =>
        resolveLegacyApiUrl({
          rawUrl: raw,
          browserUrl:
            window.location.href,
          apiOrigin: props.apiOrigin,
        });

      if (typeof input === "string") {
        return nativeFetch(
          rewrite(input),
          {
            ...init,
            credentials:
              init?.credentials ??
              "include",
          },
        );
      }

      if (input instanceof URL) {
        return nativeFetch(
          rewrite(input.toString()),
          {
            ...init,
            credentials:
              init?.credentials ??
              "include",
          },
        );
      }

      const rewritten =
        rewrite(input.url);

      const request =
        rewritten === input.url
          ? input
          : new Request(
              rewritten,
              input,
            );

      return nativeFetch(
        request,
        {
          ...init,
          credentials:
            init?.credentials ??
            request.credentials ??
            "include",
        },
      );
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, [props.apiOrigin]);

  return props.children;
}
