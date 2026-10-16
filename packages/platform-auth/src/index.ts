import NextAuth, { customFetch } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

type SessionProfileToken = {
  uid?: unknown;
  sub?: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  provider?: unknown;
  kc_id_token?: unknown;
};

type SessionProfileUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type PlatformAuthCreatedUser = Readonly<{
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}>;

export type PlatformAuthFactoryOptions = Readonly<{
  prisma: Parameters<typeof PrismaAdapter>[0];
  signInPath?: string;
  onCreateUser?: (user: PlatformAuthCreatedUser) => void | Promise<void>;
  resolveRedirect?: (args: Readonly<{
    url: string;
    baseUrl: string;
  }>) => string | Promise<string>;
}>;

const KEYCLOAK_DISCOVERY_SUFFIX = "/.well-known/openid-configuration";

function applyUserProfileToToken(
  token: SessionProfileToken,
  user: SessionProfileUser,
) {
  if (user.id) token.uid = user.id;
  token.name = user.name ?? null;
  token.email = user.email ?? null;
  token.picture = user.image ?? null;
}

async function refreshTokenProfileFromDatabase(
  prisma: PlatformAuthFactoryOptions["prisma"],
  token: SessionProfileToken,
) {
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

  let user = userId
    ? await (prisma as any).user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true },
      })
    : null;

  if (!user && email) {
    user = await (prisma as any).user.findUnique({
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

  if (!url.pathname.endsWith(KEYCLOAK_DISCOVERY_SUFFIX)) {
    return fetch(input, init);
  }

  const headers = new Headers(input instanceof Request ? input.headers : undefined);

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

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
    // Preserve diagnostic behavior for non-JSON proxy/WAF responses.
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

export function createPlatformAuth(options: PlatformAuthFactoryOptions) {
  const signInPath = options.signInPath ?? "/authenticate";

  return NextAuth({
    adapter: PrismaAdapter(options.prisma as any),
    session: { strategy: "jwt" },

    pages: {
      signIn: signInPath,
      error: signInPath,
    },

    events: options.onCreateUser
      ? {
          async createUser({ user }) {
            await options.onCreateUser?.({
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
            });
          },
        }
      : undefined,

    providers: [
      Keycloak({
        [customFetch]: keycloakFetch,
        issuer: process.env.KEYCLOAK_ISSUER!,
        clientId: process.env.KEYCLOAK_CLIENT_ID!,
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
        authorization: {
          params: { scope: "openid profile email" },
        },
        allowDangerousEmailAccountLinking: true,
      }),

      Google({
        clientId: process.env.ZOESKOUL_GOOGLE_CLIENT_ID!,
        clientSecret: process.env.ZOESKOUL_GOOGLE_CLIENT_SECRET!,
        allowDangerousEmailAccountLinking: true,
      }),
    ],

    callbacks: {
      async redirect({ url, baseUrl }) {
        if (options.resolveRedirect) {
          return options.resolveRedirect({ url, baseUrl });
        }

        if (url.startsWith("/")) {
          return `${baseUrl}${url}`;
        }

        try {
          const parsed = new URL(url);
          if (parsed.origin === baseUrl) return url;
        } catch {
          // Fall through to the safe base URL.
        }

        return baseUrl;
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
          await refreshTokenProfileFromDatabase(
            options.prisma,
            token as SessionProfileToken,
          );
        }

        if (account?.provider) {
          (token as SessionProfileToken).provider = account.provider;
        }

        if (account?.provider === "keycloak" && account?.id_token) {
          (token as SessionProfileToken).kc_id_token = account.id_token;
        }

        return token;
      },

      async session({ session, token }) {
        if (session.user) {
          if ((token as SessionProfileToken).uid) {
            (session.user as any).id = (token as SessionProfileToken).uid as string;
          }

          session.user.name = token.name ?? null;
          session.user.email = token.email ?? session.user.email;
          session.user.image = token.picture ?? null;
        }

        return session;
      },
    },
  });
}
