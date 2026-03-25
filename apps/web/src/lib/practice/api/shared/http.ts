import { NextResponse } from "next/server";
import { attachGuestCookie } from "@/lib/practice/actor";

export function hardenApiResponse<T extends Response>(res: T): T {
    res.headers.set("Cache-Control", "no-store, max-age=0");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "same-origin");
    res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    res.headers.set("Content-Security-Policy", "default-src 'none'");
    return res;
}

export function bodyJsonResponse<T>(body: T, status = 200) {
    return hardenApiResponse(NextResponse.json(body as any, { status }));
}

export function bodyJsonWithGuestCookie<T>(
    body: T,
    status = 200,
    setGuestId?: string | null,
) {
    const res = bodyJsonResponse(body, status);
    return attachGuestCookie(res, setGuestId ?? undefined);
}

export function jsonApiResponse(args: {
    requestId: string;
    message: string;
    status: number;
    extra?: Record<string, unknown>;
}) {
    const { requestId, message, status, extra } = args;

    const res = NextResponse.json(
        extra ? { message, ...extra, requestId } : { message, requestId },
        { status },
    );

    res.headers.set("X-Request-Id", requestId);
    return hardenApiResponse(res);
}

export function jsonApiWithGuestCookie(args: {
    requestId: string;
    message: string;
    status: number;
    setGuestId?: string | null;
    extra?: Record<string, unknown>;
}) {
    const res = jsonApiResponse({
        requestId: args.requestId,
        message: args.message,
        status: args.status,
        extra: args.extra,
    });

    return attachGuestCookie(res, args.setGuestId ?? undefined);
}

export function getClientIp(req: Request) {
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim() || "unknown";

    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim() || "unknown";

    return "unknown";
}

export function safeSameOriginUrl(req: Request, input: string | null | undefined) {
    if (!input) return null;
    if (input.startsWith("/")) return input;

    const allowedOrigin = process.env.APP_ORIGIN ?? new URL(req.url).origin;

    try {
        const u = new URL(input);
        if (u.origin !== allowedOrigin) return null;
        return u.pathname + u.search + u.hash;
    } catch {
        return null;
    }
}

export function enforceSameOriginPost(req: Request) {
    if (process.env.NODE_ENV !== "production") return true;

    const allowed = process.env.APP_ORIGIN;
    if (!allowed) return false;

    const origin = req.headers.get("origin");
    if (origin) return origin === allowed;

    const referer = req.headers.get("referer");
    if (!referer) return false;

    try {
        return new URL(referer).origin === allowed;
    } catch {
        return false;
    }
}

export async function readJsonSafe(req: Request) {
    try {
        return await req.json();
    } catch {
        return null;
    }
}