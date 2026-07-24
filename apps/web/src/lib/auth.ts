// src/lib/auth.ts
import NextAuth, { customFetch } from "next-auth";
import { after } from "next/server";
import Keycloak from "next-auth/providers/keycloak";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { sendWelcomeEmail } from "@/lib/email/welcomeEmail";
import { prisma } from "@/lib/prisma";

const KEYCLOAK_DISCOVERY_SUFFIX = "/.well-known/openid-configuration";

type SessionProfileToken = {
  uid?: unknown;
  sub?: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
};

type SessionProfileUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

function applyUserProfileToToken(
  token: SessionProfileToken,
  user: SessionProfileUser,
) {
  if (user.id) token.uid = user.id;
  token.name = user.name ?? null;
  token.email = user.email ?? null;
  token.picture = user.image ?? null;
}

async function refreshTokenProfileFromDatabase(token: SessionProfileToken) {
  const userId =
    typeof token.uid === "string"
      ? token.uid
      : typeof token.sub === "string"
        ? token.sub
        : null;
  const email =
    typeof token.email === "string" && token.email.trim()
      ? token.email.trim()
      : null;

  // Sessions created before `uid` was added to the JWT only have the
  // authenticated email (and sometimes a provider-specific `sub`). Resolve by
  // email as a safe fallback, then backfill `uid` into the refreshed token.
  let user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true },
      })
    : null;

  if (!user && email) {
    user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, image: true },
    });
  }

  if (user) applyUserProfileToToken(token, user);
}

const keycloakFetch: typeof fetch = async (input, init) => {
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  const url = new URL(requestUrl);

  // Keep the provider's default behavior for token, userinfo, and logout calls.
  if (!url.pathname.endsWith(KEYCLOAK_DISCOVERY_SUFFIX)) {
    return fetch(input, init);
  }

  const headers = new Headers(input instanceof Request ? input.headers : undefined);

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  // Explicit API headers avoid HTML/challenge responses from reverse proxies.
  headers.set("accept", "application/json");
  headers.set("user-agent", "zoeskoul-auth/1.0");

  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "follow",
  });

  const responseText = await response.clone().text();
  let metadataIssuer: string | null = null;

  try {
    const metadata = JSON.parse(responseText) as { issuer?: unknown };

    if (typeof metadata.issuer === "string") {
      metadataIssuer = metadata.issuer;
    }
  } catch {
    // The preview below intentionally captures non-JSON proxy/WAF responses.
  }

  const expectedIssuer = process.env.KEYCLOAK_ISSUER ?? null;
  const details = {
    url: url.toString(),
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    location: response.headers.get("location"),
    server: response.headers.get("server"),
    cfRay: response.headers.get("cf-ray"),
    metadataIssuer,
    expectedIssuer,
    bodyPreview:
      response.ok && metadataIssuer === expectedIssuer
        ? undefined
        : responseText.slice(0, 500),
  };

  if (response.ok && metadataIssuer === expectedIssuer) {
    console.info("[auth][keycloak-discovery] success", details);
  } else {
    console.error("[auth][keycloak-discovery] failure", details);
  }

  return response;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as any),
  session: { strategy: "jwt" },

  // Keep every Auth.js entry point on the branded ZoeSkoul authentication page.
  // This also catches legacy /api/auth/signin redirects without duplicating UI.
  pages: {
    signIn: "/authenticate",
    error: "/authenticate",
  },

  events: {
    createUser({ user }) {
      if (!user.email) return;

      const userId = user.id;
      const email = user.email;
      const name = user.name;

      after(async () => {
        const result = await sendWelcomeEmail({ to: email, name });

        if (result.delivered) {
          console.info("[auth][welcome-email] accepted", {
            userId,
            provider: result.provider,
            messageId: result.messageId,
          });
          return;
        }

        const details = {
          userId,
          provider: result.provider,
          reason: result.reason,
          detail: "detail" in result ? result.detail : undefined,
        };

        if (result.reason === "not_configured") {
          console.warn("[auth][welcome-email] skipped", details);
        } else {
          console.error("[auth][welcome-email] failed", details);
        }
      });
    },
  },

  providers: [
    Keycloak({
      [customFetch]: keycloakFetch,
      issuer: process.env.KEYCLOAK_ISSUER!,
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      authorization: {
        params: { scope: "openid profile email" },
      },

      // Enable ONLY if you trust Keycloak email verification
      allowDangerousEmailAccountLinking: true,
    }),

    Google({
      // fix typo: remove the trailing "r"
      clientId: process.env.ZOESKOUL_GOOGLE_CLIENT_ID!,
      clientSecret: process.env.ZOESKOUL_GOOGLE_CLIENT_SECRET!,

      // Auth.js built-in automatic linking by email
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/") && !url.startsWith("//")) {
        return `${baseUrl}${url}`;
      }

      try {
        const parsed = new URL(url);
        if (parsed.origin === baseUrl) return url;
      } catch {
        // ignore
      }

      return `${baseUrl}/en`;
    },

    async jwt({ token, user, account, trigger, session }) {
      if (user) applyUserProfileToToken(token, user);

      const profileRefreshRequested =
        trigger === "update" ||
        (typeof session === "object" &&
          session !== null &&
          "refreshProfile" in session &&
          session.refreshProfile === true);

      if (profileRefreshRequested) {
        await refreshTokenProfileFromDatabase(token);
      }

      if (account?.provider) {
        token.provider = account.provider;
      }

      // Keep Keycloak id_token for RP-initiated logout
      if (account?.provider === "keycloak" && account?.id_token) {
        token.kc_id_token = account.id_token;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        if (token.uid) {
          (session.user as any).id = token.uid as string;
        }

        session.user.name = token.name ?? null;
        session.user.email = token.email ?? session.user.email;
        session.user.image = token.picture ?? null;

        if (token.provider) {
          (session.user as any).provider = token.provider as string;
        }
      }

      return session;
    },
  },
});
