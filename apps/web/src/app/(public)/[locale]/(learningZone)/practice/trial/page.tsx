import type { Metadata } from "next";

import { resolveSharedChallengeTarget } from "@/lib/practice/challenges/target";
import { verifySharedChallenge } from "@/lib/practice/challenges/token";
import TrialPracticeClient from "./trial-practice-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrialPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSingle(
  value: string | string[] | undefined,
): string | null {
  return typeof value === "string" ? value : null;
}

export async function generateMetadata({
  searchParams,
}: TrialPageProps): Promise<Metadata> {
  const sp = await searchParams;
  const token = readSingle(sp.challenge);

  if (!token) {
    return {
      title: "Practice trial",
      description: "Try a short ZoeSkoul practice session.",
    };
  }

  const claims = verifySharedChallenge(token);
  if (!claims) {
    return {
      title: "Practice challenge",
      description: "Open this ZoeSkoul practice challenge.",
    };
  }

  try {
    const target = resolveSharedChallengeTarget(claims);
    const title = `${target.exerciseTitle} · ZoeSkoul challenge`;
    const description =
      "Can you complete this quiz or project challenge in three graded attempts? No account is required to try it.";

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
    };
  } catch {
    return {
      title: "Practice challenge",
      description: "Open this ZoeSkoul practice challenge.",
    };
  }
}

export default async function TrialPracticePage({
  params,
  searchParams,
}: TrialPageProps) {
  const { locale } = await params;
  const sp = await searchParams;

  const sessionId = readSingle(sp.sessionId);
  const subject = readSingle(sp.subject);
  const level = readSingle(sp.level);
  const challenge = readSingle(sp.challenge);

  return (
    <TrialPracticeClient
      locale={locale}
      sessionId={sessionId}
      subject={subject}
      level={level}
      challenge={challenge}
    />
  );
}
