import type { PublicChallengesAdminResponse } from "@zoeskoul/api-contracts";

import PublicChallengePublisher from "./PublicChallengePublisher";
import { PageState, StatCard } from "@/components/ui";
import { useAdminResource } from "@/lib/useAdminResource";

function initialLocale() {
  const value = new URLSearchParams(window.location.search).get("locale");
  return value === "fr" || value === "ht" ? value : "en";
}

export function PublicChallengesPage(props: {
  apiOrigin: string;
}) {
  const resource = useAdminResource<PublicChallengesAdminResponse>(
    props.apiOrigin,
    "/api/admin/public-challenges",
  );

  if (resource.kind === "loading") {
    return (
      <PageState
        kind="loading"
        title="Loading public challenges"
        message="Reading the published challenge catalog."
      />
    );
  }

  if (resource.kind === "error") {
    return (
      <PageState
        kind="error"
        title="Public challenges could not be opened"
        message={resource.message}
      />
    );
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Publishing</p>
          <h1>Public challenges</h1>
          <p className="page-description">
            Select an authored Practice exercise and create a shareable public
            challenge link. Challenge execution remains in the learner runtime.
          </p>
        </div>
      </header>

      <div className="stats-grid">
        <StatCard
          label="Shareable exercises"
          value={String(resource.data.counts.total)}
        />
        <StatCard
          label="Practice"
          value={String(resource.data.counts.practice)}
        />
      </div>

      <div className="public-challenge-publisher-host">
        <PublicChallengePublisher
          options={resource.data.options}
          initialLocale={initialLocale()}
        />
      </div>

      <section className="panel public-challenge-note">
        <p>
          Terminal-backed PTY exercises remain excluded because anonymous
          public challenges do not grant a terminal runner identity.
        </p>
      </section>
    </section>
  );
}
