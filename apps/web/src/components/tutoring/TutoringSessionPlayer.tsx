"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import type { ReviewModule } from "@/lib/subjects/types";
import TutoringWorkspaceBar, {
  getTutoringWorkspaceViewLabel,
  type TutoringWorkspaceParticipant as Participant,
  type TutoringWorkspaceView as WorkspaceView,
} from "@/components/tutoring/TutoringWorkspaceBar";

type SessionConfig = {
  id: string;
  title: string;
  status: "draft" | "live" | "shared" | "archived";
  canManage: boolean;
  canEditOwnProgress: boolean;
  canEditMasterWorkspace: boolean;
  publishedVersion: number;
  publishedAt: string | null;
  participants: Participant[];
};

function defaultView(session: SessionConfig): WorkspaceView {
  if (session.canManage) return "master";
  return session.status === "shared" ? "reference" : "master";
}


export default function TutoringSessionPlayer({
  mod,
  routePrefix,
  moduleKey,
  session,
  initialWorkspaceView = null,
  initialLearnerId = null,
}: {
  mod: ReviewModule;
  routePrefix: string;
  moduleKey: string;
  session: SessionConfig;
  initialWorkspaceView?: WorkspaceView | null;
  initialLearnerId?: string | null;
}) {
  const initialLearnerExists = session.participants.some(
    (participant) => participant.id === initialLearnerId,
  );
  const resolvedInitialView: WorkspaceView =
    session.canManage && initialWorkspaceView === "learner" && initialLearnerExists
      ? "learner"
      : initialWorkspaceView === "mine" && session.canEditOwnProgress
        ? "mine"
        : initialWorkspaceView === "master" &&
            (session.canManage || session.status === "live")
          ? "master"
          : initialWorkspaceView === "reference" &&
              (session.publishedVersion > 0 || session.status === "shared")
            ? "reference"
            : defaultView(session);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<WorkspaceView>(resolvedInitialView);
  const [learnerId, setLearnerId] = useState<string | null>(
    resolvedInitialView === "learner" ? initialLearnerId : null,
  );
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [followTutor, setFollowTutor] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishedVersion, setPublishedVersion] = useState(session.publishedVersion);
  const [sessionStatus, setSessionStatus] = useState(session.status);
  const publishedVersionRef = useRef(session.publishedVersion);

  const switchWorkspace = useCallback((
    nextView: WorkspaceView,
    nextLearnerId: string | null = null,
  ) => {
    if (nextView === view && nextLearnerId === learnerId) return;
    useReviewRuntimeStore.getState().clearRuntimeForModule();
    setLearnerId(nextLearnerId);
    setView(nextView);
    if (nextView === "master" && !session.canManage) setFollowTutor(true);
    setNotice(null);

    const nextQuery = new URLSearchParams(searchParams.toString());
    nextQuery.set("workspace", nextView);
    if (nextView === "learner" && nextLearnerId) {
      nextQuery.set("learnerId", nextLearnerId);
    } else {
      nextQuery.delete("learnerId");
    }
    router.replace(`${pathname}?${nextQuery.toString()}`, { scroll: false });
  }, [
    learnerId,
    pathname,
    router,
    searchParams,
    session.canManage,
    view,
  ]);


  const selectedLearner = useMemo(
    () => session.participants.find((participant) => participant.id === learnerId) ?? null,
    [learnerId, session.participants],
  );

  useEffect(() => {
    publishedVersionRef.current = publishedVersion;
  }, [publishedVersion]);

  useEffect(() => {
    const controller = new AbortController();

    const refreshMeta = async () => {
      try {
        const response = await fetch(
          `/api/tutoring-sessions/${encodeURIComponent(session.id)}/workspace/meta`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) return;
        const json = await response.json();
        const nextVersion = Math.max(0, Number(json.publishedVersion ?? 0));
        const nextStatus =
          json.status === "draft" ||
          json.status === "live" ||
          json.status === "shared" ||
          json.status === "archived"
            ? json.status
            : sessionStatus;
        const previousVersion = publishedVersionRef.current;

        setSessionStatus(nextStatus);
        if (nextVersion > previousVersion) {
          publishedVersionRef.current = nextVersion;
          setPublishedVersion(nextVersion);

          if (!session.canManage) {
            setNotice(
              `The tutor published session reference v${nextVersion}. Your workspace was not changed.`,
            );
          }

          if (view === "reference") {
            useReviewRuntimeStore.getState().clearRuntimeForModule();
            setWorkspaceRevision((value) => value + 1);
          }
        }

        if (
          !session.canManage &&
          sessionStatus === "live" &&
          nextStatus === "shared" &&
          view === "master"
        ) {
          switchWorkspace("reference");
        }
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          // The lesson remains usable if the lightweight metadata refresh fails.
        }
      }
    };

    void refreshMeta();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshMeta();
    }, 5000);
    const onFocus = () => void refreshMeta();
    window.addEventListener("focus", onFocus);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [session.canManage, session.id, sessionStatus, switchWorkspace, view]);


  function updateFollowTutor(next: boolean) {
    setFollowTutor(next);
    if (!next) {
      setNotice("You can browse the tutor workspace without being moved to the tutor's active file.");
      return;
    }

    useReviewRuntimeStore.getState().clearRuntimeForModule();
    setWorkspaceRevision((value) => value + 1);
    setNotice("Following the tutor's active file and workspace updates.");
  }

  async function applyTutorUpdate() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/tutoring-sessions/${encodeURIComponent(session.id)}/workspace/apply-updates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moduleKey }),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error ?? "Could not apply the tutor update.");
      }
      useReviewRuntimeStore.getState().clearRuntimeForModule();
      const appliedVersion = Number(json.publishedVersion ?? publishedVersionRef.current);
      publishedVersionRef.current = appliedVersion;
      setPublishedVersion(appliedVersion);
      setWorkspaceRevision((value) => value + 1);
      setNotice(`Tutor version ${appliedVersion} was merged into My workspace.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not apply the tutor update.");
    } finally {
      setBusy(false);
    }
  }

  async function publishTutorWorkspace() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/tutoring-sessions/${encodeURIComponent(session.id)}/publish`,
        { method: "POST" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error ?? "Could not publish the tutor workspace.");
      }
      const nextVersion = Number(json?.meta?.publishedVersion ?? publishedVersion + 1);
      publishedVersionRef.current = nextVersion;
      setPublishedVersion(nextVersion);
      setNotice(`Published session reference version ${nextVersion}.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not publish the tutor workspace.",
      );
    } finally {
      setBusy(false);
    }
  }

  const canEdit =
    view === "master"
      ? session.canEditMasterWorkspace
      : view === "mine"
        ? session.canEditOwnProgress
        : false;
  const canEditBoard = canEdit;
  const viewLabel = getTutoringWorkspaceViewLabel({
    session: {
      canManage: session.canManage,
      canEditOwnProgress: session.canEditOwnProgress,
    },
    sessionStatus,
    view,
    publishedVersion,
    selectedLearner,
  });

  return (
    <div className="h-screen w-screen overflow-hidden">
      <ReviewModulePageClient
        supplementalHeader={
          <TutoringWorkspaceBar
            session={{
              canManage: session.canManage,
              canEditOwnProgress: session.canEditOwnProgress,
            }}
            sessionStatus={sessionStatus}
            view={view}
            learnerId={learnerId}
            selectedLearner={selectedLearner}
            participants={session.participants}
            publishedVersion={publishedVersion}
            followTutor={followTutor}
            canEdit={canEdit}
            busy={busy}
            notice={notice}
            onSwitchWorkspace={switchWorkspace}
            onToggleFollowTutor={() => updateFollowTutor(!followTutor)}
            onApplyTutorUpdate={applyTutorUpdate}
            onPublishTutorWorkspace={publishTutorWorkspace}
          />
        }
        mod={mod}
        canUnlockAll
        routePrefix={routePrefix}
        tutoringSession={{
          id: session.id,
          canEdit,
          canEditBoard,
          title: session.title,
          viewLabel,
          workspaceView: view,
          learnerId: view === "learner" ? learnerId : null,
          status: sessionStatus,
          publishedVersion,
          workspaceRevision,
          followTutor,
        }}
      />
    </div>
  );
}
