import { Link } from "@/i18n/navigation";

export default function TutoringSessionCard({ session }: { session: any }) {
  const snapshot = session.snapshot as any;
  const first = snapshot?.modules?.[0];
  const href = first
    ? `/tutoring-sessions/${session.id}/subjects/${session.sourceSubjectSlug}/modules/${first.sessionModuleSlug}/learn`
    : `/tutoring-sessions/${session.id}`;

  return (
    <article className="ui-page-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="ui-section-kicker">Tutoring session</div>
          <h2 className="mt-1 ui-title-sm">{session.title}</h2>
          <p className="mt-1 ui-meta">{session.subject.title}</p>
        </div>
        <span className="ui-badge capitalize">{session.status}</span>
      </div>
      {session.description ? (
        <p className="mt-4 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">{session.description}</p>
      ) : null}
      <div className="mt-4 text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
        Tutor: {session.owner.name || session.owner.email || "ZoeSkoul tutor"}
      </div>
      <Link href={href} className="ui-btn ui-btn-primary mt-4 inline-flex">
        Open saved session
      </Link>
    </article>
  );
}
