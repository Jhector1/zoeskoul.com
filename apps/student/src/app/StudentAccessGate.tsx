import {
  buildAuthenticateUrl,
  type AppSessionResponse,
} from "@zoeskoul/auth-client";
import { useAppSession } from "@zoeskoul/auth-client/react";
import {
  useEffect,
  type ReactNode,
} from "react";

type AuthenticatedSession = Extract<
  AppSessionResponse,
  { authenticated: true }
>;

export function StudentAccessGate(props: {
  apiOrigin: string;
  websiteOrigin: string;
  children: (session: AuthenticatedSession) => ReactNode;
}) {
  const state = useAppSession({
    apiOrigin: props.apiOrigin,
  });

  useEffect(() => {
    if (
      state.status !== "ready" ||
      state.session.authenticated
    ) {
      return;
    }

    const signInUrl = buildAuthenticateUrl({
      websiteOrigin: props.websiteOrigin,
      callbackUrl: window.location.href,
    });

    window.location.replace(signInUrl);
  }, [
    props.websiteOrigin,
    state,
  ]);

  if (state.status === "loading") {
    return (
      <main className="student-state-page" aria-busy="true">
        <section className="student-state-card">
          <div className="student-state-spinner" aria-hidden="true" />
          <p className="student-state-eyebrow">ZoeSkoul Student</p>
          <h1>Opening your learning space</h1>
          <p>Checking your session and database permissions.</p>
        </section>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="student-state-page">
        <section className="student-state-card">
          <p className="student-state-eyebrow">Session unavailable</p>
          <h1>We could not open your learning space</h1>
          <p>{state.error}</p>
          <button
            className="student-primary-button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (!state.session.authenticated) {
    return (
      <main className="student-state-page" aria-busy="true">
        <section className="student-state-card">
          <div className="student-state-spinner" aria-hidden="true" />
          <p className="student-state-eyebrow">Sign-in required</p>
          <h1>Taking you to ZoeSkoul sign in</h1>
          <p>You will return to this page after authentication.</p>
        </section>
      </main>
    );
  }

  if (!state.session.capabilities.accessStudentApp) {
    return (
      <main className="student-state-page">
        <section className="student-state-card">
          <p className="student-state-eyebrow">Access unavailable</p>
          <h1>This account cannot open the student application</h1>
          <p>
            Access is controlled by the roles stored for your account in the
            ZoeSkoul database.
          </p>
          <a
            className="student-primary-button"
            href={props.websiteOrigin}
          >
            Return to ZoeSkoul
          </a>
        </section>
      </main>
    );
  }

  return props.children(state.session);
}
