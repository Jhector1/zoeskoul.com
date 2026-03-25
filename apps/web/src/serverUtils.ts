// src/serverUtils.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import {cookies} from "next/headers";

export async function getLocaleFromCookie() {
    const c = await cookies();
    return c.get("NEXT_LOCALE")?.value ?? "en";
}