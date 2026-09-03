import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { buildAuthenticateAccessHref } from "@zoeskoul/permissions/accessGate";
import InvitationAccountActions from "@/components/learningAssignments/InvitationAccountActions";
import { auth } from "@/lib/auth";
import {
  acceptLearningGroupInvite,
  findLearningGroupInviteByToken,
  learningGroupInviteState,
  maskLearningGroupInviteEmail,
} from "@/lib/learningGroups/groupInvites";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false, nocache: true } };

function InviteMessage(props: { kicker: string; title: string; body: string; children?: ReactNode }) {
  return (
    <main className="ui-container py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="ui-section-kicker">{props.kicker}</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{props.title}</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{props.body}</p>
        {props.children ? <div className="mt-5">{props.children}</div> : null}
      </div>
    </main>
  );
}

export default async function ClassInvitationPage({ params }: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: "auth.classInvitePage" });
  const invite = await findLearningGroupInviteByToken(prisma, token);

  if (!invite) {
    return <InviteMessage kicker={t("kicker")} title={t("notFoundTitle")} body={t("notFoundBody")} />;
  }

  const state = learningGroupInviteState(invite);
  if (state === "expired" || state === "revoked") {
    return (
      <InviteMessage
        kicker={t("kicker")}
        title={t(state === "expired" ? "expiredTitle" : "withdrawnTitle")}
        body={t("inactiveBody")}
      />
    );
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const userEmail = session?.user?.email;
  const invitePath = `/${locale}/invitations/class/${encodeURIComponent(token)}`;

  if (!userId) {
    redirect(buildAuthenticateAccessHref({
      locale,
      next: invitePath,
      reason: "class_invite",
      resource: invite.group.name,
    }));
  }

  const accepted = await acceptLearningGroupInvite(prisma, { token, userId, userEmail });
  if (!accepted.ok) {
    if (accepted.reason === "email_mismatch") {
      return (
        <InviteMessage
          kicker={t("kicker")}
          title={t("wrongAccountTitle")}
          body={t("wrongAccountBody", {
            invitedEmail: maskLearningGroupInviteEmail(accepted.invitedEmail),
            currentEmail: userEmail || t("anotherAccount"),
          })}
        >
          <InvitationAccountActions callbackUrl={invitePath} />
        </InviteMessage>
      );
    }
    return <InviteMessage kicker={t("kicker")} title={t("unavailableTitle")} body={t("unavailableBody")} />;
  }

  redirect(`/${locale}/assignments`);
}
