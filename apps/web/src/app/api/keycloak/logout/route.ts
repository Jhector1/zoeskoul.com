import {
  GET as logout,
} from "../../auth/logout/route";
import type {
  NextRequest,
} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compatibility for older links. Browser-supplied provider tokens are ignored.
export function GET(req: NextRequest) {
  return logout(req);
}
