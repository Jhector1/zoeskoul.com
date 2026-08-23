import {
  buildAuthenticateUrl,
  type AppSessionResponse,
} from "@zoeskoul/auth-client";
import { useAppSession } from "@zoeskoul/auth-client/react";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { adminFetch } from "@/lib/adminApi";

type AuthenticatedSession = Extract<
  AppSessionResponse,
  { authenticated: true }
>;

export type AdminAppAccess = {
  isAdmin: boolean;
  canPublishChallenges: boolean;
};

function isPublicChallengesPath() {
  return (
    window.location.pathname === "/public-challenges" ||
    window.location.pathname === "/admin/public-challenges"
  );
}

export function AdminAccessGate(props: {
  apiOrigin: string;
  websiteOrigin: string;
  children: (
    session: AuthenticatedSession,
    access: AdminAppAccess,
  ) => ReactNode;
}) {
  const state = useAppSession({
    apiOrigin: props.apiOrigin,
  });
  const [publisherState, setPublisherState] = useState<
    "idle" | "loading" | "allowed" | "denied"
  >("idle");

  const isAdmin =
    state.status === "authenticated" &&
    state.session.capabilities.includes("admin:access");

  const publisherRoute =
    typeof window !== "undefined" &&
    isPublicChallengesPath();

  useEffect(() => {
    if (state.status !== "unauthenticated") {
      return;
    }

    window.location.replace(
      buildAuthenticateUrl({
        websiteOrigin: props.websiteOrigin,
        callbackUrl: window.location.href,
      }),
    );
  }, [props.websiteOrigin, state]);

  useEffect(() => {
    if (
      state.status !== "authenticated" ||
      isAdmin ||
      !publisherRoute
    ) {
      setPublisherState("idle");
      return;
    }

    let active = true;
    setPublisherState("loading");

    void adminFetch(
      "/api/admin/public-challenges",
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      },
    )
      .then((response) => {
        if (!active) return;
        setPublisherState(
          response.ok ? "allowed" : "denied",
        );
      })
      .catch(() => {
        if (!active) return;
        setPublisherState("denied");
      });

    return () => {
      active = false;
    };
  }, [
    isAdmin,
    publisherRoute,
    state.status,
  ]);

  if (state.status === "loading") {
    return (
      <main className="access-screen" aria-busy="true">
        <section className="access-card">
          <span className="loading-dot" aria-hidden="true" />
          <p className="eyebrow">ZoeSkoul Admin</p>
          <h1>Opening admin</h1>
          <p>Checking your session and permissions.</p>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="access-screen">
        <section className="access-card">
          <p className="eyebrow">Session unavailable</p>
          <h1>Admin could not be opened</h1>
          <p>{state.error.message}</p>
          <button
            className="button button-primary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <main className="access-screen" aria-busy="true">
        <section className="access-card">
          <span className="loading-dot" aria-hidden="true" />
          <p className="eyebrow">Sign-in required</p>
          <h1>Taking you to ZoeSkoul sign in</h1>
        </section>
      </main>
    );
  }

  if (isAdmin) {
    return props.children(
      state.session,
      {
        isAdmin: true,
        canPublishChallenges: true,
      },
    );
  }

  if (publisherRoute && publisherState === "loading") {
    return (
      <main className="access-screen" aria-busy="true">
        <section className="access-card">
          <span className="loading-dot" aria-hidden="true" />
          <p className="eyebrow">Publisher access</p>
          <h1>Opening public challenges</h1>
          <p>Checking your publishing permissions.</p>
        </section>
      </main>
    );
  }

  if (publisherRoute && publisherState === "allowed") {
    return props.children(
      state.session,
      {
        isAdmin: false,
        canPublishChallenges: true,
      },
    );
  }

  return (
    <main className="access-screen">
      <section className="access-card">
        <p className="eyebrow">Access required</p>
        <h1>This account cannot open this Admin page</h1>
        <p>
          Platform administration requires Admin access. Public Challenges
          additionally accepts the canonical publisher and author roles.
        </p>
        <a
          className="button button-secondary"
          href={props.websiteOrigin}
        >
          Return to ZoeSkoul
        </a>
      </section>
    </main>
  );
}
