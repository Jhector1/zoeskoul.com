"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import PracticeShell from "@/components/practice/PracticeShell";
import PracticePathWizard from "@/components/practice/PracticePathWizard";
import { startGlobalNavigationPending } from "@/components/navigation/GlobalNavigationProgress";
import { usePracticeController } from "@/features/practice/client/usePracticeController";
import type {
  PracticeChooserCatalog,
  PracticeChooserMode,
  PracticeChooserSelection,
  SubscriberPracticeSessionSummary,
} from "@/lib/practice/experience/practiceChooserTypes";
import { startSelfPacedPractice } from "@zoeskoul/learning-client";

type StartResult = {
  sessionId: string;
  subjectSlug: string | null;
  moduleSlug: string | null;
  experienceMode: "daily_five";
};

function PracticeSessionShell({ result }: { result: StartResult }) {
  const t = useTranslations("Practice");
  const { shellProps } = usePracticeController({
    sessionId: result.sessionId,
    subjectSlug: result.subjectSlug ?? undefined,
    moduleSlug: result.moduleSlug ?? undefined,
    authoritativeSessionId: true,
    surface: "daily_practice",
    initialExperienceMode: result.experienceMode,
    clientStatePersistence: "off",
  });
  return <PracticeShell {...shellProps} t={t} />;
}

export default function DailyFivePracticeClient(props: {
  locale: string;
  mode: PracticeChooserMode;
  catalogs: PracticeChooserCatalog[];
  initialSelection: PracticeChooserSelection;
  targetCount: number;
  activeSessions: SubscriberPracticeSessionSummary[];
}) {
  const router = useRouter();
  const t = useTranslations("Practice.dailyStart");
  const [result, setResult] = useState<StartResult | null>(null);
  const [busy, setBusy] = useState(props.mode === "free");
  const [error, setError] = useState<string | null>(null);

  const startFreePractice = useCallback(
    async (selection?: PracticeChooserSelection | null) => {
      setBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/practice/daily/start", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale: props.locale,
            subjectSlug: selection?.subjectSlug || undefined,
            moduleSlug: selection?.moduleSlug || undefined,
          }),
        });
        const data = await response.json().catch(() => null);

        if (
          response.ok &&
          data?.sessionId &&
          data?.experienceMode === "daily_five"
        ) {
          setResult(data as StartResult);
          return;
        }

        // No current session exists yet. The server intentionally returns a
        // selection response when called without a scope; the server-rendered
        // chooser already contains the richer hierarchy and access state.
        if (!selection && data?.code === "DAILY_SUBJECT_REQUIRED") {
          return;
        }

        setError(
          String(data?.message ?? "Could not start today’s daily practice."),
        );
      } catch {
        setError("Could not start today’s daily practice.");
      } finally {
        setBusy(false);
      }
    },
    [props.locale],
  );

  useEffect(() => {
    if (props.mode !== "free") {
      setBusy(false);
      return;
    }

    void startFreePractice(null);
  }, [props.mode, startFreePractice]);

  const startSubscriberPractice = useCallback(
    async (selection: PracticeChooserSelection, targetCount: number) => {
      setBusy(true);
      setError(null);

      try {
        const started = await startSelfPacedPractice({
          locale: props.locale,
          subjectSlug: selection.subjectSlug,
          moduleSlug: selection.moduleSlug,
          targetCount,
        });

        startGlobalNavigationPending({
          label: started.resumed ? t("continuing") : t("starting"),
          source: "subscriber-practice-session",
          targetHref: started.href,
          minVisibleMs: 350,
        });
        router.push(started.href);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not start this practice session.",
        );
      } finally {
        setBusy(false);
      }
    },
    [props.locale, router, t],
  );

  const handleStart = async (
    selection: PracticeChooserSelection,
    targetCount: number,
  ) => {
    if (props.mode === "subscriber") {
      await startSubscriberPractice(selection, targetCount);
      return;
    }

    await startFreePractice(selection);
  };

  if (result) {
    return <PracticeSessionShell key={result.sessionId} result={result} />;
  }

  return (
    <PracticePathWizard
      catalogs={props.catalogs}
      mode={props.mode}
      targetCount={props.targetCount}
      initialSelection={props.initialSelection}
      busy={busy}
      error={error}
      activeSessions={props.activeSessions}
      onStart={handleStart}
      onResume={(session) =>
        startSubscriberPractice(session.selection, session.totalCount)
      }
    />
  );
}
