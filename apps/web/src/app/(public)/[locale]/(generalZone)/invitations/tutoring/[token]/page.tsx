import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAuthenticateAccessHref } from "@/lib/access/accessGate";
import {
  findTutoringSessionInviteByToken,
  markTutoringSessionInviteViewed,
  maskTutoringInviteEmail,
  tutoringSessionInviteState,
} from "@/lib/tutoring/sessionInvites";
import InvitationAccountActions from "@/components/learningAssignments/InvitationAccountActions";
import TutoringInvitationActions from "@/components/tutoring/TutoringInvitationActions";

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
  if (inviteState === "expired" || inviteState === "cancelled") {
    return (
      <InviteMessage
        title={inviteState === "expired" ? "Invitation expired" : "Invitation cancelled"}
        body="Ask your tutor to create a new invitation link for this session."
      />
    );
  }
  if (inviteState === "declined") {
    return (
      <InviteMessage
        title="Invitation declined"
        body="You declined this tutoring invitation. Ask your tutor to resend it if you want to join."
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

  const normalizedUserEmail = userEmail?.trim().toLowerCase() ?? null;
  const matchesUser = invite.invitedUserId
    ? invite.invitedUserId === userId
    : normalizedUserEmail === invite.email;
  if (!matchesUser) {
    return (
      <InviteMessage
        title="Use the account that received this invitation"
        body={`This link was sent to ${maskTutoringInviteEmail(invite.email)}. You are currently signed in as ${userEmail ?? "another account"}.`}
      >
        <InvitationAccountActions callbackUrl={invitePath} />
      </InviteMessage>
    );
  }

  if (invite.acceptedAt) {
    redirect(`/${locale}/tutoring-sessions/${invite.session.id}`);
  }

  await markTutoringSessionInviteViewed(prisma, {
    inviteId: invite.id,
    userId,
  });

  const canAccept =
    invite.session.status === "live" || invite.session.status === "shared";
  return (
    <InviteMessage
      title={`Join ${invite.session.title}`}
      body={
        canAccept
          ? `Accept this invitation to add the tutoring session to your confirmed learning and enter the workspace.`
          : "This invitation is linked to your ZoeSkoul account. The tutor has not opened the session yet."
      }
    >
      <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
        <div><strong>Course:</strong> {invite.session.subject.title}</div>
        <div className="mt-1"><strong>Tutor:</strong> {invite.session.owner.name || invite.session.owner.email || "ZoeSkoul tutor"}</div>
      </div>
      <TutoringInvitationActions
        invitationId={invite.id}
        sessionId={invite.session.id}
        canAccept={canAccept}
      />
    </InviteMessage>
  );
}
