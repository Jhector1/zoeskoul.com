import TrialPracticeClient from "./trial-practice-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TrialPracticePage({
                                                    params,
                                                    searchParams,
                                                }: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { locale } = await params;
    const sp = await searchParams;

    const sessionId = typeof sp.sessionId === "string" ? sp.sessionId : null;
    const subject = typeof sp.subject === "string" ? sp.subject : null;
    const level = typeof sp.level === "string" ? sp.level : null;

    return (
        <TrialPracticeClient
            locale={locale}
            sessionId={sessionId}
            subject={subject}
            level={level}
        />
    );
}