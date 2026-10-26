import Link from "next/link";

export const metadata = {
  title: "Sign-in problem | ZoeBuild",
  robots: { index: false, follow: false },
};

type Reason =
  | "invalid_request"
  | "exchange_rejected"
  | "authority_unavailable"
  | "session_unavailable";
const explanations: Record<Reason, string> = {
  invalid_request: "The sign-in request expired or its browser verification did not match.",
  exchange_rejected: "The one-time sign-in ticket was rejected or has expired.",
  authority_unavailable: "ZoeBuild could not reach the authentication authority.",
  session_unavailable: "Your ZoeBuild session could not be verified.",
};

/** Public terminal state; never redirects automatically to a protected page. */
export default async function HandoffErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = typeof params.reason === "string" ? params.reason : "";
  const reason = Object.prototype.hasOwnProperty.call(explanations, raw)
    ? (raw as Reason)
    : "session_unavailable";

  return (
    <main className="ui-container mx-auto max-w-xl py-16">
      <section className="ui-page-surface p-8" aria-labelledby="auth-error-title">
        <h1 id="auth-error-title" className="ui-section-title">Sign-in could not finish</h1>
        <p className="ui-section-subtitle mt-3">{explanations[reason]}</p>
        <p className="mt-4 text-sm">
          Confirm that the Zoéskoul website, Redis, and the ZoeBuild tunnel are running.
          You can then retry sign-in explicitly.
        </p>
        <div className="mt-6 flex gap-4">
          <a
            className="ui-btn-primary inline-flex items-center px-4 py-2"
            href="/api/auth/handoff/start?returnTo=%2Fen%2Fprojects"
          >
            Retry sign-in
          </a>
          <Link className="ui-btn-secondary inline-flex items-center px-4 py-2" href="/">
            Return to home
          </Link>
        </div>
      </section>
    </main>
  );
}
