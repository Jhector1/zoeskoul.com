"use client";

import { useCallback, useRef, useState } from "react";

import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";

import FullIDE from "@zoeskoul/learner-workspace/fullide/FullIDE";

export type BuildWorkspaceShellProject = Readonly<{
  buildProjectId: string;
  codeProjectId: string;
  title: string;
  description: string | null;
  status: string;
  stackId: string | null;
  sourceVersion: number;
  language: WorkspaceStateV2["language"];
  workspace: WorkspaceStateV2;
}>;

type SaveState =
  | { kind: "idle"; message: string | null }
  | { kind: "saving"; message: string | null }
  | { kind: "saved"; message: string }
  | { kind: "error"; message: string };

export default function BuildWorkspaceClient({
  project,
}: {
  project: BuildWorkspaceShellProject;
}) {
  const latestWorkspaceRef = useRef<WorkspaceStateV2>(project.workspace);
  const editRevisionRef = useRef(0);
  const clientInstanceIdRef = useRef<string | null>(null);

  const [sourceVersion, setSourceVersion] = useState(project.sourceVersion);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({
    kind: "idle",
    message: null,
  });

  const handleWorkspaceChange = useCallback(
    (
      workspace: WorkspaceStateV2 | null,
      meta?: { origin?: "user" | "sync" | "programmatic" },
    ) => {
      if (!workspace || meta?.origin !== "user") return;

      latestWorkspaceRef.current = workspace;
      editRevisionRef.current += 1;
      setDirty(true);
      setSaveState({ kind: "idle", message: null });
    },
    [],
  );

  const saveSource = useCallback(async () => {
    if (!dirty || saveState.kind === "saving") return;

    const workspace = latestWorkspaceRef.current;
    const savingRevision = editRevisionRef.current;
    const baseVersion = sourceVersion;

    setSaveState({ kind: "saving", message: null });

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(project.buildProjectId)}/source`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseVersion,
            workspace,
            clientInstanceId:
              clientInstanceIdRef.current ??
              (clientInstanceIdRef.current = crypto.randomUUID()),
            clientDraftUpdatedAt: new Date().toISOString(),
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            code?: string;
            message?: string;
            source?: {
              sourceVersion?: number;
            };
            conflict?: {
              serverVersion?: number;
            };
          }
        | null;

      if (response.status === 409) {
        const serverVersion = payload?.conflict?.serverVersion;
        setSaveState({
          kind: "error",
          message:
            typeof serverVersion === "number"
              ? `A newer source version (${serverVersion}) exists. Reload the project before saving again.`
              : "A newer source version exists. Reload the project before saving again.",
        });
        return;
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Source could not be saved.");
      }

      const nextVersion = payload.source?.sourceVersion;
      if (typeof nextVersion !== "number" || !Number.isInteger(nextVersion)) {
        throw new Error("The server returned an invalid source version.");
      }

      setSourceVersion(nextVersion);

      if (editRevisionRef.current === savingRevision) {
        setDirty(false);
        setSaveState({
          kind: "saved",
          message: `Saved as source v${nextVersion}.`,
        });
      } else {
        setSaveState({
          kind: "idle",
          message: `Source v${nextVersion} saved. Newer local edits remain unsaved.`,
        });
      }
    } catch (error) {
      setSaveState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Source could not be saved.",
      });
    }
  }, [dirty, project.buildProjectId, saveState.kind, sourceVersion]);

  return (
    <div className="space-y-4">
      <div className="ui-page-surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{project.title}</div>
          <div className="mt-0.5 text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
            {project.stackId ?? "Stack pending"} - source v{sourceVersion}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full border border-[rgb(var(--ui-border)/0.8)] px-3 py-1 text-xs font-semibold capitalize">
            {project.status.replaceAll("_", " ")}
          </div>
          <button
            type="button"
            onClick={() => void saveSource()}
            disabled={!dirty || saveState.kind === "saving"}
            className="rounded-lg border border-[rgb(var(--ui-border)/0.9)] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveState.kind === "saving" ? "Saving..." : dirty ? "Save source" : "Saved"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
        Source editing and versioned saves are enabled. Run, terminal, AI
        generation, package installation, and publishing remain disabled until
        their dedicated Build boundaries are added.
      </div>

      {saveState.message ? (
        <div
          role={saveState.kind === "error" ? "alert" : "status"}
          className="ui-page-surface px-4 py-3 text-sm"
        >
          {saveState.message}
        </div>
      ) : null}

      <FullIDE
        title={project.title}
        language={project.language}
        access={{
          hasUser: true,
          canUseMultiFile: true,
          canSaveCloud: false,
          canCreateProjects: false,
        }}
        initialProjectId={null}
        projectTitle={project.title}
        projectDescription={project.description}
        initialWorkspace={project.workspace}
        onWorkspaceChange={handleWorkspaceChange}
        draftStorageMode="off"
        showTopLanguageButtons={false}
        storageKey={`zoeskoul.build.${project.buildProjectId}.workspace`}
        servicePreset="workspace"
        services={{
          chrome: {
            showBackButton: false,
            showLessonLink: false,
            showTopLanguageButtons: false,
          },
          explorer: {
            showActions: true,
            showHistoryControls: false,
            showFooter: false,
            showStdin: false,
            fileActions: {
              enabled: true,
              createFile: true,
              createFolder: true,
              rename: true,
              delete: true,
              dragDrop: true,
            },
          },
          runner: {
            allowRun: false,
            showTerminal: false,
            showTerminalDockToggle: false,
            showOpenTerminalButton: false,
            showRestartTerminalButton: false,
            showSqlDialectPicker: false,
            enableWorkspaceTerminal: false,
          },
          projects: {
            showProjectSwitcher: false,
            showCloudProjects: false,
            showSaveControls: false,
            showSaveAs: false,
          },
        }}
      />
    </div>
  );
}
