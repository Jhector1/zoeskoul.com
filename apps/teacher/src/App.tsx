import { useAppSession } from "@zoeskoul/auth-client/react";
import type { AppCapability } from "@zoeskoul/auth-client";
import {
  getLocalAppOrigin,
  normalizeSupportedLocale,
} from "@zoeskoul/app-config";

import TeacherTutoringDashboard from "./features/tutoring/TeacherTutoringDashboard";

const TEACHER_ACCESS_CAPABILITY: AppCapability =
  "teacher:access";

function browserLocale() {
  if (typeof navigator === "undefined") {
    return "en" as const;
  }

  return normalizeSupportedLocale(
    navigator.language.split("-")[0],
  );
}

export function App() {
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ??
    getLocalAppOrigin("website");
  const websiteOrigin =
    import.meta.env.VITE_WEBSITE_ORIGIN ??
    apiOrigin;

  const sessionState = useAppSession({ apiOrigin });
  const session =
    sessionState.status === "authenticated" ||
    sessionState.status === "unauthenticated"
      ? sessionState.session
      : null;

  if (sessionState.status === "loading") {
    return (
      <main className="app-shell">
        <section className="foundation-card">
          <div className="eyebrow">ZoeSkoul Teacher</div>
          <h1>Loading teacher workspace</h1>
          <p>Checking the central ZoeSkoul session...</p>
        </section>
      </main>
    );
  }

  if (sessionState.status === "error") {
    return (
      <main className="app-shell">
        <section className="foundation-card">
          <div className="eyebrow">ZoeSkoul Teacher</div>
          <h1>Teacher workspace unavailable</h1>
          <p>
            Session check failed:{" "}
            {sessionState.error.message}
          </p>
        </section>
      </main>
    );
  }

  if (!session?.authenticated) {
    return (
      <main className="app-shell">
        <section className="foundation-card">
          <div className="eyebrow">ZoeSkoul Teacher</div>
          <h1>Sign in required</h1>
          <p>
            Sign in to ZoeSkoul with a teacher account
            to manage tutoring.
          </p>
        </section>
      </main>
    );
  }

  if (
    !session.capabilities.includes(
      TEACHER_ACCESS_CAPABILITY,
    )
  ) {
    return (
      <main className="app-shell">
        <section className="foundation-card">
          <div className="eyebrow">ZoeSkoul Teacher</div>
          <h1>Teacher access required</h1>
          <p>
            Signed in, but this account cannot access
            the teacher app.
          </p>
        </section>
      </main>
    );
  }

  return (
    <TeacherTutoringDashboard
      apiOrigin={apiOrigin}
      websiteOrigin={websiteOrigin}
      locale={browserLocale()}
    />
  );
}
