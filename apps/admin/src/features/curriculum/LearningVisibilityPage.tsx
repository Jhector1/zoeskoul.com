import type {
  LearningVisibilityAdminResponse,
  LearningVisibilityChangeResponse,
  LearningVisibilityItem,
} from "@zoeskoul/api-contracts";
import { useMemo, useState } from "react";

import { Badge, PageHeader, PageState, Panel, StatCard } from "@/components/ui";
import { adminApi } from "@/lib/adminApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { selectVisibilityItems } from "./learningVisibilityView";

const API_PATH = "/api/admin/learning-visibility";

export function LearningVisibilityPage({ apiOrigin }: { apiOrigin: string }) {
  const resource = useAdminResource<LearningVisibilityAdminResponse>(apiOrigin, API_PATH);
  if (resource.kind === "loading") {
    return <PageState kind="loading" title="Loading course visibility" message="Checking published curriculum and admin preferences." />;
  }
  if (resource.kind === "error") {
    return <PageState kind="error" title="Course visibility unavailable" message={resource.message} />;
  }
  return <LearningVisibilityWorkspace key={apiOrigin} apiOrigin={apiOrigin} initial={resource.data} />;
}

function LearningVisibilityWorkspace({ apiOrigin, initial }: {
  apiOrigin: string;
  initial: LearningVisibilityAdminResponse;
}) {
  const [items, setItems] = useState(initial.items);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const visible = useMemo(() => selectVisibilityItems(items, query, filter), [items, query, filter]);
  const hiddenCount = items.filter(item => item.hidden).length;
  const seededCount = items.filter(item => item.seeded).length;

  async function update(item: LearningVisibilityItem) {
    if (busyKey || !item.seeded) return;
    const key = `${item.kind}:${item.slug}`;
    const nextHidden = !item.hidden;
    setBusyKey(key);
    setError(null);
    setMessage(null);
    try {
      const result = await adminApi(apiOrigin).request<LearningVisibilityChangeResponse>(API_PATH, {
        method: "PATCH",
        json: { kind: item.kind, slug: item.slug, hidden: nextHidden },
        cache: "no-store",
      });
      if (result.ok !== true || result.visibility?.kind !== item.kind ||
          result.visibility.slug !== item.slug || result.visibility.hidden !== nextHidden) {
        throw new Error("Server returned an unexpected visibility result.");
      }
      setItems(current => current.map(candidate =>
        candidate.kind === item.kind && candidate.slug === item.slug
          ? { ...candidate, hidden: nextHidden }
          : candidate,
      ));
      setMessage(`${item.title} is now ${nextHidden ? "hidden from" : "visible in"} discovery.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the visibility change.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="page-stack learning-visibility-page">
      <PageHeader
        eyebrow="Curriculum administration"
        title="Course & catalog visibility"
        description="Control which courses and catalogs appear in discovery. Hiding does not delete courses, revoke enrollments, or reset progress."
        actions={<button type="button" className="button button-secondary" onClick={() => window.location.reload()}>Refresh audit</button>}
      />
      <div className="stats-grid">
        <StatCard label="Catalogs and courses" value={String(items.length)} detail="Published manifest entries" />
        <StatCard label="Database-backed" value={String(seededCount)} detail="Eligible for Hide / Show" />
        <StatCard label="Hidden" value={String(hiddenCount)} detail="Admin discovery preference" />
        <StatCard label="Audit observations" value={String(initial.audit.issues.length)} detail="Read-only comparison" />
      </div>
      <Panel title="Discovery preferences" description="These preferences are stored on existing course/catalog records and preserved by curriculum seeding.">
        <div className="visibility-controls">
          <label className="visibility-search"><span>Find a course or catalog</span>
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title or slug" />
          </label>
          <label className="visibility-filter"><span>Show</span>
            <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
              <option value="all">All items</option>
              <option value="visible">Visible only</option>
              <option value="hidden">Hidden only</option>
            </select>
          </label>
        </div>
        {error ? <p className="visibility-alert visibility-alert-error" role="alert">{error}</p> : null}
        {message ? <p className="visibility-alert visibility-alert-success" role="status">{message}</p> : null}
        {(["catalog", "course"] as const).map(kind => {
          const group = visible.filter(item => item.kind === kind);
          return (
            <div className="visibility-group" key={kind}>
              <h3>{kind === "catalog" ? "Catalogs" : "Courses"} <span>({group.length})</span></h3>
              {group.length ? group.map(item => {
                const key = `${kind}:${item.slug}`;
                return <div className="visibility-row" key={key}>
                  <div className="visibility-item-details">
                    <strong>{item.title}</strong>
                    <span className="visibility-item-slug">{item.slug}</span>
                    <span className="visibility-item-status">Publication: {item.status}</span>
                  </div>
                  <div className="visibility-actions">
                    <Badge tone={!item.seeded ? "warn" : item.hidden ? "warn" : "good"}>
                      {!item.seeded ? "No DB record" : item.hidden ? "Hidden" : "Visible"}
                    </Badge>
                    <button type="button" className="button button-secondary"
                      disabled={busyKey !== null || !item.seeded}
                      title={!item.seeded ? "A database record is required for admin visibility preferences" : undefined}
                      aria-label={`${item.hidden ? "Show" : "Hide"} ${item.title}`}
                      aria-pressed={item.hidden}
                      onClick={() => void update(item)}>
                      {busyKey === key ? "Saving…" : item.hidden ? "Show" : "Hide"}
                    </button>
                  </div>
                </div>;
              }) : <p className="visibility-empty">No matching {kind === "catalog" ? "catalogs" : "courses"}.</p>}
            </div>
          );
        })}
      </Panel>
      <Panel title="Manifest / database reconciliation" description="Read-only observations; missing manifest-only courses are not automatically seeded, and historical DB rows are preserved.">
        <div className="visibility-audit-summary" data-testid="learning-reconciliation-summary">
          {initial.audit.summary.manifestCatalogs} manifest catalogs · {initial.audit.summary.manifestCourses} manifest courses · {initial.audit.summary.storedCatalogs} DB catalogs · {initial.audit.summary.storedCourses} DB courses
        </div>
        {initial.audit.issues.length ? (
          <div className="visibility-audit-scroll">
            <table className="visibility-audit-table">
              <thead><tr><th>Type</th><th>Slug</th><th>Observation</th></tr></thead>
              <tbody>{initial.audit.issues.map((issue, index) => (
                <tr key={`${issue.kind}:${issue.slug}:${issue.code}:${index}`}>
                  <td>{issue.kind}</td><td><code>{issue.slug}</code></td><td>{issue.message}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="visibility-audit-clean">No differences detected in audited status, identity, or catalog membership.</p>}
        <p className="visibility-note">This audit does not copy lesson content into the database. Administrators approve curriculum seeding separately; existing student progress is never reconciled from a manifest.</p>
      </Panel>
    </section>
  );
}
