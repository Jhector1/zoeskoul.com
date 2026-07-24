import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAuthenticateAccessHref } from "@/lib/access/accessGate";
import {
  acceptTutoringSessionInvite,
  findTutoringSessionInviteByToken,
  maskTutoringInviteEmail,
  tutoringSessionInviteState,
} from "@/lib/tutoring/sessionInvites";
import InvitationAccountActions from "@/components/learningAssignments/InvitationAccountActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

function InviteMessage({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <main className="ui-container py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="ui-section-kicker">Tutoring invitation</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{body}</p>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </main>
  );
}

export default async function TutoringInvitationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const invite = await findTutoringSessionInviteByToken(prisma, token);

  if (!invite) {
    return (
      <InviteMessage
        title="Invitation not found"
        body="This invitation link is invalid or has been replaced. Ask your tutor for a new link."
      />
    );
  }

  const inviteState = tutoringSessionInviteState(invite);
  if (inviteState === "expired" || inviteState === "revoked") {
    return (
      <InviteMessage
        title={inviteState === "expired" ? "Invitation expired" : "Invitation withdrawn"}
        body="Ask your tutor to create a new invitation link for this session."
      />
    );
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const userEmail = session?.user?.email;
  const invitePath = `/${locale}/invitations/tutoring/${encodeURIComponent(token)}`;

  if (!userId) {
    redirect(
      buildAuthenticateAccessHref({
        locale,
        next: invitePath,
        reason: "tutoring_invite",
        resource: invite.session.title,
      }),
    );
  }

  const accepted = await acceptTutoringSessionInvite(prisma, {
    token,
    userId,
    userEmail,
  });

  if (!accepted.ok) {
    if (accepted.reason === "email_mismatch") {
      return (
        <InviteMessage
          title="Use the account that received this invitation"
          body={`This link was sent to ${maskTutoringInviteEmail(accepted.invitedEmail)}. You are currently signed in as ${userEmail ?? "another account"}.`}
        >
          <InvitationAccountActions callbackUrl={invitePath} />
        </InviteMessage>
      );
    }

    return (
      <InviteMessage
        title="This tutoring classroom is not available"
        body={
          accepted.reason === "session_unavailable"
            ? "The tutor has not made this session Live or Shared, or the session has been archived."
            : "This invitation cannot be used. Ask your tutor for a new link."
        }
      />
    );
  }

  redirect(`/${locale}/tutoring-sessions/${accepted.session.id}`);
}
