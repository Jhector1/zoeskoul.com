import { useAppSession } from "@zoeskoul/auth-client/react";
import {
  getLocalAppOrigin,
  zoeSkoulApps,
} from "@zoeskoul/app-config";

const app = zoeSkoulApps.teacher;

export function App() {
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ??
    getLocalAppOrigin("website");

  const sessionState = useAppSession({ apiOrigin });
  const session =
    sessionState.status === "ready"
      ? sessionState.session
      : null;

  const sessionSummary =
    sessionState.status === "loading"
      ? "Checking the central ZoeSkoul session…"
      : sessionState.status === "error"
        ? `Session check failed: ${sessionState.error}`
        : !session?.authenticated
          ? "Signed out"
          : session.capabilities.accessTeacherApp
            ? "Authenticated teaching application session ready"
            : "Signed in, but this account cannot access the teacher app";

  const identity =
    session?.authenticated && session.user
      ? session.user.email ?? session.user.name ?? session.user.id
      : "—";

  const roles =
    session?.authenticated && session.user
      ? session.user.roles.join(", ") || "none"
      : "—";

  return (
    <main className="app-shell">
      <section className="foundation-card">
        <div className="eyebrow">Multi-app migration</div>

        <h1>ZoeSkoul Teacher</h1>

        <p>
          The teaching, learner review, assignment and live tutoring application.
        </p>

        <dl>
          <div>
            <dt>Application</dt>
            <dd>{app.id}</dd>
          </div>

          <div>
            <dt>Local origin</dt>
            <dd>{getLocalAppOrigin(app.id)}</dd>
          </div>

          <div>
            <dt>Temporary API origin</dt>
            <dd>{apiOrigin}</dd>
          </div>

          <div>
            <dt>Identity</dt>
            <dd>{identity}</dd>
          </div>

          <div>
            <dt>Database roles</dt>
            <dd>{roles}</dd>
          </div>
        </dl>

        <div className="status">
          {sessionSummary}
        </div>
      </section>
    </main>
  );
}
