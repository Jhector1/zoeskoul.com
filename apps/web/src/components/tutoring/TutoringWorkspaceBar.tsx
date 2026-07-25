"use client";

import React from "react";
import { Check } from "lucide-react";

export type TutoringWorkspaceView = "master" | "reference" | "mine" | "learner";

export type TutoringWorkspaceParticipant = {
  id: string;
  name: string | null;
  email: string | null;
  role: "learner" | "observer";
};

export type TutoringWorkspaceSessionUi = {
  canManage: boolean;
  canEditOwnProgress: boolean;
};

function participantLabel(participant: TutoringWorkspaceParticipant | null) {
  return participant?.name || participant?.email || "Learner";
}

export function getTutoringWorkspaceViewLabel({
  session,
  sessionStatus,
  view,
  publishedVersion,
  selectedLearner,
}: {
  session: TutoringWorkspaceSessionUi;
  sessionStatus: "draft" | "live" | "shared" | "archived";
  view: TutoringWorkspaceView;
  publishedVersion: number;
  selectedLearner: TutoringWorkspaceParticipant | null;
}) {
  return view === "master"
    ? session.canManage
      ? sessionStatus === "shared"
        ? "Tutor draft workspace"
        : "Tutor live workspace"
      : "Tutor live workspace"
    : view === "reference"
      ? `Session reference v${publishedVersion || 1}`
      : view === "learner"
        ? `${participantLabel(selectedLearner)}'s workspace`
        : "My workspace";
}

function getWorkspaceStatus({
  sessionStatus,
  view,
  publishedVersion,
}: {
  sessionStatus: "draft" | "live" | "shared" | "archived";
  view: TutoringWorkspaceView;
  publishedVersion: number;
}) {
  if (view === "reference") {
    return {
      label: `Version ${publishedVersion || 1}`,
      tone: "neutral" as const,
    };
  }

  if (view === "mine") {
    return { label: "Private", tone: "neutral" as const };
  }

  if (view === "learner") {
    return { label: "Learner workspace", tone: "neutral" as const };
  }

  if (sessionStatus === "live") {
    return { label: "Live", tone: "good" as const };
  }

  if (sessionStatus === "shared") {
    return { label: "Draft", tone: "neutral" as const };
  }

  if (sessionStatus === "archived") {
    return { label: "Archived", tone: "neutral" as const };
  }

  return { label: "Draft", tone: "neutral" as const };
}

function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good";
}) {
  return (
    <span
      className={tone === "good" ? "ui-badge-good shrink-0" : "ui-badge-neutral shrink-0"}
    >
      {label}
    </span>
  );
}

export default function TutoringWorkspaceBar({
  session,
  sessionStatus,
  view,
  learnerId,
  selectedLearner,
  participants,
  publishedVersion,
  followTutor,
  canEdit,
  busy,
  notice,
  onSwitchWorkspace,
  onToggleFollowTutor,
  onApplyTutorUpdate,
  onPublishTutorWorkspace,
}: {
  session: TutoringWorkspaceSessionUi;
  sessionStatus: "draft" | "live" | "shared" | "archived";
  view: TutoringWorkspaceView;
  learnerId: string | null;
  selectedLearner: TutoringWorkspaceParticipant | null;
  participants: TutoringWorkspaceParticipant[];
  publishedVersion: number;
  followTutor: boolean;
  canEdit: boolean;
  busy: boolean;
  notice: string | null;
  onSwitchWorkspace: (
    nextView: TutoringWorkspaceView,
    nextLearnerId?: string | null,
  ) => void;
  onToggleFollowTutor: () => void;
  onApplyTutorUpdate: () => void;
  onPublishTutorWorkspace: () => void;
}) {
  const sharedWorkspaceLabel = sessionStatus === "live" ? "Tutor" : "Session";
  const status = getWorkspaceStatus({ sessionStatus, view, publishedVersion });

  return (
    <section
      data-testid="tutoring-workspace-bar"
      aria-label="Tutoring workspace controls"
      className="relative z-40 shrink-0 border-b border-neutral-200/80 bg-white/94 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-950/92"
    >
      <div className="mx-auto flex min-w-0 items-center gap-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-white/55">
          Workspace
        </span>

        <div className="flex min-w-max items-center gap-2">
          {session.canManage ? (
            <>
              <button
                type="button"
                className={view === "master" ? "ui-btn ui-btn-primary" : "ui-btn ui-btn-secondary"}
                onClick={() => onSwitchWorkspace("master")}
                aria-pressed={view === "master"}
              >
                {sessionStatus === "shared" ? "Tutor draft" : "Tutor"}
              </button>

              {publishedVersion > 0 ? (
                <button
                  type="button"
                  className={view === "reference" ? "ui-btn ui-btn-primary" : "ui-btn ui-btn-secondary"}
                  onClick={() => onSwitchWorkspace("reference")}
                  aria-pressed={view === "reference"}
                >
                  Reference
                </button>
              ) : null}

              {participants.length ? (
                <select
                  className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  value={view === "learner" ? learnerId ?? "" : ""}
                  onChange={(event) => {
                    const id = event.target.value;
                    if (id) onSwitchWorkspace("learner", id);
                  }}
                  aria-label="Open learner workspace"
                >
                  <option value="">View learner…</option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participantLabel(participant)}
                    </option>
                  ))}
                </select>
              ) : null}

              {sessionStatus === "shared" && view === "master" ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  onClick={onPublishTutorWorkspace}
                  disabled={busy}
                >
                  {busy ? "Publishing…" : "Publish update"}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className={
                  view === "master" || view === "reference"
                    ? "ui-btn ui-btn-primary"
                    : "ui-btn ui-btn-secondary"
                }
                onClick={() =>
                  onSwitchWorkspace(sessionStatus === "shared" ? "reference" : "master")
                }
                aria-pressed={view === "master" || view === "reference"}
              >
                {sharedWorkspaceLabel}
              </button>

              {session.canEditOwnProgress ? (
                <button
                  type="button"
                  className={view === "mine" ? "ui-btn ui-btn-primary" : "ui-btn ui-btn-secondary"}
                  onClick={() => onSwitchWorkspace("mine")}
                  aria-pressed={view === "mine"}
                >
                  Mine
                </button>
              ) : null}

              {sessionStatus === "live" && view === "master" ? (
                <button
                  type="button"
                  className={followTutor ? "ui-btn ui-btn-info-secondary" : "ui-btn ui-btn-secondary"}
                  onClick={onToggleFollowTutor}
                  aria-pressed={followTutor}
                  title={
                    followTutor
                      ? "Tutor navigation and active-file changes are followed automatically."
                      : "Follow the tutor's current lesson and active file."
                  }
                >
                  {followTutor ? <Check aria-hidden="true" className="h-4 w-4" /> : null}
                  {followTutor ? "Following tutor" : "Follow tutor"}
                </button>
              ) : null}

              {session.canEditOwnProgress &&
              sessionStatus === "shared" &&
              view === "mine" &&
              publishedVersion > 0 ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary"
                  onClick={onApplyTutorUpdate}
                  disabled={busy}
                >
                  {busy ? "Applying…" : `Apply update v${publishedVersion}`}
                </button>
              ) : null}
            </>
          )}

          <span
            aria-hidden="true"
            className="mx-1 h-6 w-px shrink-0 bg-neutral-200 dark:bg-white/10"
          />

          <StatusBadge label={status.label} tone={status.tone} />
          {!canEdit ? <StatusBadge label="Read only" /> : null}
        </div>

        {notice ? (
          <span
            aria-live="polite"
            className="ml-auto min-w-[15rem] max-w-lg shrink-0 text-xs font-medium text-neutral-600 dark:text-neutral-300"
          >
            {notice}
          </span>
        ) : null}
      </div>
    </section>
  );
}
