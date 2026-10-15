export const metadata = {
  title: "Sign in",
};

export default function ZoeBuildAuthenticatePage() {
  return (
    <main className="zb-page">
      <section className="zb-panel">
        <div className="zb-eyebrow">ZoeBuild account</div>
        <h1>Sign in to build.</h1>
        <p>
          Use your Zoéskoul account to access ZoeBuild. Student enrollment is
          not required.
        </p>
        <div className="zb-actions">
          <a className="zb-primary" href="/api/auth/signin/keycloak">
            Continue with Zoéskoul
          </a>
          <a className="zb-secondary" href="/api/auth/signin/google">
            Continue with Google
          </a>
        </div>
      </section>
    </main>
  );
}
