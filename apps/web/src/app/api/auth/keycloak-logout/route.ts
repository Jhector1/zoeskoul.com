import {
  GET as logout,
} from "../logout/route";
import type {
  NextRequest,
} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compatibility for older links. New application callers use /api/auth/logout.
export function GET(req: NextRequest) {
  return logout(req);
}
