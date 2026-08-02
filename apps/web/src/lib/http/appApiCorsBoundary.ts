import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  appCorsPreflight,
  applyAppCorsHeaders,
  isAppOriginAllowed,
} from "@/lib/http/appCors";

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Shared browser-app boundary for every Web-owned API route.
 *
 * Individual route handlers remain responsible for authentication,
 * authorization, validation, CSRF-sensitive mutation checks, and business
 * behavior. This boundary only standardizes trusted cross-application CORS
 * transport for Student, Teacher, and Admin browser applications.
 */
export function handleAppApiCorsBoundary(
  request: NextRequest,
): Response | null {
  if (!isApiPath(request.nextUrl.pathname)) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return appCorsPreflight(request);
  }

  if (!isAppOriginAllowed(request)) {
    return applyAppCorsHeaders(
      request,
      NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    );
  }

  return applyAppCorsHeaders(
    request,
    NextResponse.next(),
  );
}
