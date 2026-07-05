"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import PracticeShell from "@/components/practice/PracticeShell";
import { usePracticeController } from "@/features/practice/client/usePracticeController";

type StartResult = {
  sessionId: string;
  subjectSlug: string | null;
  moduleSlug: string | null;
};

function DailyFiveShell({ result }: { result: StartResult }) {
  const t = useTranslations("Practice");
  const { shellProps } = usePracticeController({
    sessionId: result.sessionId,
    subjectSlug: result.subjectSlug ?? undefined,
    moduleSlug: result.moduleSlug ?? undefined,
  });
  return <PracticeShell {...shellProps} t={t} />;
}

export default function DailyFivePracticeClient(props: {
  locale: string;
  subjectSlug: string | null;
  moduleSlug: string | null;
}) {
  const [result, setResult] = useState<StartResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/practice/daily/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: props.locale,
          subjectSlug: props.subjectSlug,
          moduleSlug: props.moduleSlug,
        }),
      });
      const data = await response.json().catch(() => null);
      if (cancelled) return;
      if (!response.ok) {
        setError(String(data?.message ?? "Could not start today’s daily practice."));
        return;
      }
      setResult(data as StartResult);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.locale, props.subjectSlug, props.moduleSlug]);

  if (error) {
    return (
      <div className="ui-container py-10">
        <div className="ui-surface-danger p-5">{error}</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="ui-container py-10">
        <div className="ui-page-surface p-5">Preparing today’s daily practice…</div>
      </div>
    );
  }

  return <DailyFiveShell result={result} />;
}
