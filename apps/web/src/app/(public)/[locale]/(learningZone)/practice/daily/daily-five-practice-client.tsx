"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import PracticeShell from "@/components/practice/PracticeShell";
import PracticePathWizard from "@/components/practice/PracticePathWizard";
import { startGlobalNavigationPending } from "@/components/navigation/GlobalNavigationProgress";
import { usePracticeController } from "@/features/practice/client/usePracticeController";
import type {
  PracticeChooserCatalog,
  PracticeChooserMode,
  PracticeChooserSelection,
  SubscriberPracticeContinuationSummary,
} from "@/lib/practice/experience/practiceChooserTypes";
import {
  buildPracticeChooserRouteHref,
  parsePracticeChooserRoutePathname,
  startSelfPacedPractice,
} from "@zoeskoul/learning-client";

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
  continuations: SubscriberPracticeContinuationSummary[];
  continueToPractice?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("Practice.dailyStart");
  const [result, setResult] = useState<StartResult | null>(null);
  const [busy, setBusy] = useState(props.mode === "free");
  const [error, setError] = useState<string | null>(null);
  const continuationStartedRef = useRef(false);
  const routeState = useMemo(
    () => parsePracticeChooserRoutePathname(pathname),
    [pathname],
  );
  const chooserSelection = useMemo<PracticeChooserSelection>(() => {
    if (routeState && routeState.depth !== "root") {
      return {
        ...routeState.selection,
        sectionSlug: "",
        topicSlug: "",
      };
    }
    return props.initialSelection;
  }, [props.initialSelection, routeState]);
  const navigateChooser = useCallback(
    (selection: PracticeChooserSelection) => {
      router.push(
        buildPracticeChooserRouteHref({
          locale: props.locale,
          selection,
        }),
        { scroll: false },
      );
    },
    [props.locale, router],
  );

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

    if (
      props.continueToPractice &&
      chooserSelection.subjectSlug &&
      chooserSelection.moduleSlug
    ) {
      return;
    }

    void startFreePractice(null);
  }, [
    chooserSelection.moduleSlug,
    chooserSelection.subjectSlug,
    props.continueToPractice,
    props.mode,
    startFreePractice,
  ]);

  const startSubscriberPractice = useCallback(
    async (selection: PracticeChooserSelection) => {
      setBusy(true);
      setError(null);

      try {
        const started = await startSelfPacedPractice({
          locale: props.locale,
          subjectSlug: selection.subjectSlug,
          moduleSlug: selection.moduleSlug,
        });

        startGlobalNavigationPending({
          label: started.resumed ? t("continuing") : t("starting"),
          source: "subscriber-practice-continuation",
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

  useEffect(() => {
    if (
      !props.continueToPractice ||
      !chooserSelection.subjectSlug ||
      !chooserSelection.moduleSlug ||
      continuationStartedRef.current
    ) {
      return;
    }

    continuationStartedRef.current = true;
    if (props.mode === "subscriber") {
      void startSubscriberPractice(chooserSelection);
      return;
    }

    void startFreePractice(chooserSelection);
  }, [
    props.continueToPractice,
    chooserSelection,
    props.mode,
    startFreePractice,
    startSubscriberPractice,
  ]);

  const handleStart = async (
    selection: PracticeChooserSelection,
    targetCount: number,
  ) => {
    if (props.mode === "subscriber") {
      await startSubscriberPractice(selection);
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
      initialSelection={chooserSelection}
      onSelectionChange={navigateChooser}
      busy={busy}
      error={error}
      continuations={props.continuations}
      onStart={handleStart}
      onContinue={(continuation) =>
        startSubscriberPractice(continuation.selection)
      }
    />
  );
}
