import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  getLocalAppOrigin,
} from "@zoeskoul/app-config";
import type { Session } from "./next-auth";
import {
  buildStudentLogoutUrl,
} from "../app/studentLogout";

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
  redirectTo?: string;
}) {
  const locale =
    window.location.pathname
      .split("/")
      .filter(Boolean)[0] ??
    "en";
  const websiteOrigin =
    import.meta.env.VITE_WEBSITE_ORIGIN ??
    getLocalAppOrigin("website");
  const url = buildStudentLogoutUrl({
    websiteOrigin,
    locale,
  });

  window.location.assign(url);
  return { url };
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
