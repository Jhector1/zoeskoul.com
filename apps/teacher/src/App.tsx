import {
  getLocalAppOrigin,
  zoeSkoulApps,
} from "@zoeskoul/app-config";

const app = zoeSkoulApps.teacher;

export function App() {
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ??
    getLocalAppOrigin("website");

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
        </dl>

        <div className="status">
          Vite foundation ready
        </div>
      </section>
    </main>
  );
}
