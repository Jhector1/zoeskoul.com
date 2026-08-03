import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";

export async function requireAdmin(_request?: Request) {
  const access = await getCurrentUserAccess();

  if (!access.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!access.capabilities.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
