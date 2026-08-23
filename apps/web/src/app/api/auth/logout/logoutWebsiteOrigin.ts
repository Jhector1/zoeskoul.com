import { resolveWebsiteOriginForRuntime } from "@/lib/http/websiteOrigin";

export function resolveLogoutWebsiteOrigin(args: {
  requestOrigin: string;
  nodeEnv?: string;
  vercelEnv?: string;
}): string {
  return resolveWebsiteOriginForRuntime(args);
}
