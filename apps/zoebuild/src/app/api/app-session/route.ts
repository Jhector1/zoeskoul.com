import { cookies } from "next/headers";
import { EMPTY_SESSION, SESSION_COOKIE, readBuilderSession } from "@/lib/auth/buildHandoff";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  const session = value ? await readBuilderSession(value) : EMPTY_SESSION;
  return Response.json(session, { headers: { "Cache-Control": "no-store, private" } });
}
