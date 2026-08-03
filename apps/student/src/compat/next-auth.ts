export type Session = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    roles?: string[];
    [key: string]: unknown;
  };
  expires?: string;
};

export type User = NonNullable<Session["user"]>;
export type Account = Record<string, unknown>;
export type Profile = Record<string, unknown>;
export type NextAuthConfig = Record<string, unknown>;

export const customFetch = Symbol.for(
  "next-auth.custom-fetch",
);

async function unavailableResponse() {
  return new Response(
    "This Auth.js server handler is unavailable in the Vite client.",
    {
      status: 501,
    },
  );
}

export default function NextAuth(
  _config: NextAuthConfig,
) {
  return {
    handlers: {
      GET: unavailableResponse,
      POST: unavailableResponse,
    },
    auth: async () => null,
    signIn: async () => undefined,
    signOut: async () => undefined,
  };
}
