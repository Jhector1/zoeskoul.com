// src/lib/auth.ts
import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

  providers: [
    Keycloak({
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

    async jwt({ token, user, account }) {
      if (user?.id) token.uid = user.id;

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
      if (session.user && token.uid) {
        (session.user as any).id = token.uid as string;
      }

      if (session.user && token.provider) {
        (session.user as any).provider = token.provider as string;
      }

      return session;
    },
  },
});