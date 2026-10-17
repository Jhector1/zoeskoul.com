"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";

import FullIDE from "@zoeskoul/learner-workspace/fullide/FullIDE";
import { PersistentReactPreviewSlot } from "@/components/builder/PersistentReactPreviewHost";

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
  onWorkspaceSnapshot,
  onSourceVersionChange,
  onDirtyChange,
  remoteWebPreview,
  remotePreviewActive,
}: {
  project: BuildWorkspaceShellProject;
  onWorkspaceSnapshot?: (workspace: WorkspaceStateV2) => void;
  onSourceVersionChange?: (sourceVersion: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  remoteWebPreview?: RemoteWebPreviewDescriptor | null;
  remotePreviewActive: boolean;
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

  useEffect(() => {
    onSourceVersionChange?.(sourceVersion);
  }, [onSourceVersionChange, sourceVersion]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleWorkspaceChange = useCallback(
    (
      workspace: WorkspaceStateV2 | null,
      meta?: { origin?: "user" | "sync" | "programmatic" },
    ) => {
      if (!workspace || meta?.origin !== "user") return;

      latestWorkspaceRef.current = workspace;
      onWorkspaceSnapshot?.(workspace);
      editRevisionRef.current += 1;
      setDirty(true);
      setSaveState({ kind: "idle", message: null });
    },
    [onWorkspaceSnapshot],
  );

  const saveSource = useCallback(async () => {
    if (!dirty || saveState.kind === "saving") return;

    const workspace = latestWorkspaceRef.current;
    const savingRevision = editRevisionRef.current;
    const baseVersion = sourceVersion;

    setSaveState({ kind: "saving", message: null });

    try {
      const response = await fetch(
        `/api/build/projects/${encodeURIComponent(project.buildProjectId)}/source`,
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
    <div className="zb-code-workspace">
      <div className="zb-code-savebar">
        <span className="zb-code-savebar-status">
          {dirty
            ? `Unsaved changes · source v${sourceVersion}`
            : `Source v${sourceVersion}`}
        </span>

        <button
          type="button"
          onClick={() => void saveSource()}
          disabled={!dirty || saveState.kind === "saving"}
          className="zb-code-savebar-button"
        >
          {saveState.kind === "saving"
            ? "Saving..."
            : dirty
              ? "Save"
              : "Saved"}
        </button>
      </div>


      {saveState.message ? (
        <div
          role={saveState.kind === "error" ? "alert" : "status"}
          className="zb-code-save-message"
        >
          {saveState.message}
        </div>
      ) : null}

      <div className="zb-code-fullide">
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
                remoteWebPreview={remoteWebPreview ?? undefined}
                remoteWebPreviewSurface={
                  remoteWebPreview ? (
                    <PersistentReactPreviewSlot
                      buildProjectId={project.buildProjectId}
                      slotId="code-preview"
                      preview={remoteWebPreview}
                      active={remotePreviewActive}
                    />
                  ) : undefined
                }
                draftStorageMode="off"
                fullHeight
                showTopLanguageButtons={false}
                storageKey={`zoeskoul.build.${project.buildProjectId}.workspace`}
                servicePreset="workspace"
                services={{
                  chrome: {
                    showHeader: false,
                    showBackButton: false,
                    showLessonLink: false,
                    showActivePath: false,
                    showStatus: false,
                    showTopLanguageButtons: false
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
                    showTerminal: true,
                    showTerminalDockToggle: true,
                    initialTerminalDock: "right",
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
    </div>
  );
}
