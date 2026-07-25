import { Link } from "@/i18n/navigation";
import TutoringInvitationActions from "./TutoringInvitationActions";

function invitationLabel(state: string) {
  if (state === "viewed") return "Invitation viewed";
  if (state === "declined") return "Invitation declined";
  if (state === "expired") return "Invitation expired";
  if (state === "cancelled") return "Invitation cancelled";
  return "Invitation pending";
}

export default function TutoringSessionCard({ session }: { session: any }) {
  const firstModuleSlug = session.moduleKeys?.[0] as string | undefined;
  const href = firstModuleSlug
    ? `/tutoring-sessions/${session.id}/subjects/${session.sourceSubjectSlug}/modules/${firstModuleSlug}/learn`
    : `/tutoring-sessions/${session.id}`;
  const invitation = session.invitation ?? null;
  const invitationPending = Boolean(invitation);
  const canRespond =
    invitation &&
    (invitation.state === "invited" || invitation.state === "viewed") &&
    (session.status === "live" || session.status === "shared");

  return (
    <article className="ui-page-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="ui-section-kicker">Tutoring session</div>
          <h2 className="mt-1 ui-title-sm">{session.title}</h2>
          <p className="mt-1 ui-meta">{session.subject.title}</p>
        </div>
        <span className="ui-badge capitalize">
          {invitationPending ? invitationLabel(invitation.state) : session.status}
        </span>
      </div>
      {session.description ? (
        <p className="mt-4 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">{session.description}</p>
      ) : null}
      <div className="mt-4 text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
        Tutor: {session.owner.name || session.owner.email || "ZoeSkoul tutor"}
      </div>
      {invitationPending ? (
        <>
          <div className="mt-3 text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
            {session.status === "draft"
              ? "This invitation is already in your account. The tutor has not opened the session yet."
              : invitation.emailStatus === "FAILED"
                ? "The email notification failed, but the in-app invitation is available here."
                : "Accept before entering the tutoring workspace."}
          </div>
          {invitation.state === "invited" || invitation.state === "viewed" ? (
            <TutoringInvitationActions
              invitationId={invitation.id}
              sessionId={session.id}
              canAccept={Boolean(canRespond)}
              compact
            />
          ) : null}
        </>
      ) : (
        <Link href={href} className="ui-btn ui-btn-primary mt-4 inline-flex">
          Open saved session
        </Link>
      )}
    </article>
  );
}
