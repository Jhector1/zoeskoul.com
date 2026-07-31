import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { Session } from "./next-auth";

type SessionContextValue = {
  data: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
};

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "loading",
});

export function SessionProvider(props: {
  session: Session | null;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider
      value={{
        data: props.session,
        status: props.session
          ? "authenticated"
          : "unauthenticated",
      }}
    >
      {props.children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export async function signOut(_options?: {
  redirect?: boolean;
  callbackUrl?: string;
}) {
  return { url: window.location.href };
}

export async function signIn(
  _provider?: string,
  options?: { callbackUrl?: string },
) {
  if (options?.callbackUrl) {
    window.location.assign(options.callbackUrl);
  }
  return undefined;
}
