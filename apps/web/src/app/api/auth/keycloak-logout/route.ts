import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export const runtime = "nodejs";

function safePostLogoutUrl(req: NextRequest) {
    const origin = req.nextUrl.origin;
    const raw = req.nextUrl.searchParams.get("postLogoutRedirect") || "/";

    // allow only same-origin absolute URLs (prevents open-redirect)
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
        try {
            const u = new URL(raw);
            if (u.origin === origin) return u.toString();
            return origin + "/";
        } catch {
            return origin + "/";
        }
    }

    return new URL(raw, origin).toString();
}

export async function GET(req: NextRequest) {
    const issuer = process.env.KEYCLOAK_ISSUER;
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

    const postLogout = safePostLogoutUrl(req);

    // If env missing, just go back to app
    if (!issuer || !clientId || !secret) {
        return NextResponse.redirect(postLogout);
    }

    const token = await getToken({ req, secret });
    const idToken = (token as any)?.kc_id_token as string | undefined;

    const kcLogout = new URL(`${issuer}/protocol/openid-connect/logout`);
    kcLogout.searchParams.set("client_id", clientId);
    kcLogout.searchParams.set("post_logout_redirect_uri", postLogout);

    // Keycloak clears SSO best with id_token_hint when available
    if (idToken) kcLogout.searchParams.set("id_token_hint", idToken);

    const res = NextResponse.redirect(kcLogout.toString());
    res.headers.set("Cache-Control", "no-store");
    return res;
}
