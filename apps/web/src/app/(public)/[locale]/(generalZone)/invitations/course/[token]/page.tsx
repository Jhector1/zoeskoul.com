import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { actorKeyOf } from "@/lib/practice/actor";
import { buildAuthenticateAccessHref } from "@/lib/access/accessGate";
import {
  acceptLearningAssignmentInvite,
  findLearningAssignmentInviteByToken,
  learningAssignmentInviteState,
  maskInviteEmail,
} from "@/lib/learningAssignments/assignmentInvites";
import { openLearningAssignmentForUser } from "@/lib/learningAssignments/openLearningAssignment";
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
        <div className="ui-section-kicker">Course invitation</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{body}</p>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </main>
  );
}

export default async function CourseInvitationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const invite = await findLearningAssignmentInviteByToken(prisma, token);

  if (!invite) {
    return (
      <InviteMessage
        title="Invitation not found"
        body="This invitation link is invalid or has been replaced. Ask your instructor for a new link."
      />
    );
  }

  const inviteState = learningAssignmentInviteState(invite);
  if (inviteState === "expired" || inviteState === "revoked") {
    return (
      <InviteMessage
        title={inviteState === "expired" ? "Invitation expired" : "Invitation withdrawn"}
        body="Ask your instructor to create a new invitation link for this course."
      />
    );
  }

  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const userEmail = session?.user?.email;
  const invitePath = `/${locale}/invitations/course/${encodeURIComponent(token)}`;

  if (!userId) {
    redirect(
      buildAuthenticateAccessHref({
        locale,
        next: invitePath,
        reason: "course_invite",
        resource: invite.assignment.title,
      }),
    );
  }

  const accepted = await acceptLearningAssignmentInvite(prisma, {
    token,
    userId,
    userEmail,
  });

  if (!accepted.ok) {
    if (accepted.reason === "email_mismatch") {
      return (
        <InviteMessage
          title="Use the account that received this invitation"
          body={`This link was sent to ${maskInviteEmail(accepted.invitedEmail)}. You are currently signed in as ${userEmail ?? "another account"}.`}
        >
          <InvitationAccountActions callbackUrl={invitePath} />
        </InviteMessage>
      );
    }

    return (
      <InviteMessage
        title="This classroom is not available"
        body={
          accepted.reason === "assignment_unavailable"
            ? "The instructor has not published this assignment or has closed it."
            : "This invitation cannot be used. Ask your instructor for a new link."
        }
      />
    );
  }

  const opened = await openLearningAssignmentForUser(prisma, {
    assignmentId: accepted.assignment.id,
    userId,
    actorKey: actorKeyOf({ userId, guestId: null }),
    locale,
  });

  if (opened.ok) {
    redirect(opened.href);
  }

  if (opened.error === "upcoming") {
    redirect(`/${locale}/assignments?notice=invite-accepted-upcoming`);
  }

  redirect(`/${locale}/assignments?notice=invite-unavailable`);
}
