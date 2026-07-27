import {
  isTrustedBrowserAppOrigin,
} from "@zoeskoul/app-config";

export function resolveAuthRedirect(args: {
  url: string;
  baseUrl: string;
  includeLocalApps: boolean;
}): string {
  if (args.url.startsWith("/") && !args.url.startsWith("//")) {
    return `${args.baseUrl}${args.url}`;
  }

  try {
    const parsed = new URL(args.url);

    if (
      parsed.origin === args.baseUrl ||
      isTrustedBrowserAppOrigin(parsed.origin, {
        includeLocal: args.includeLocalApps,
      })
    ) {
      return parsed.toString();
    }
  } catch {
    // Invalid and untrusted callback values fall through to the website.
  }

  return `${args.baseUrl}/en`;
}
