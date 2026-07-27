import type { AppSessionResponse } from "@zoeskoul/api-contracts";

import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const access = await getCurrentUserAccess();
  const authenticated = access.authenticated && Boolean(access.user);

  const body: AppSessionResponse = {
    authenticated,
    user:
      authenticated && access.user
        ? {
            ...access.user,
            roles: access.capabilities.appRoles,
          }
        : null,
    capabilities: access.capabilities,
  };

  return appCorsJson(request, body);
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
