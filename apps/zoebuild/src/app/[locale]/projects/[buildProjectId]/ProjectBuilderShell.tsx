"use client";

import Link from "next/link";

import {
  ProjectCodeIcon,
  ProjectPreviewIcon,
} from "@/components/builder/ProjectTopbarIcons";

import {
  useState,
} from "react";

import type { ZoeBuildMode } from "@/components/builder/ZoeBuildModeTabs";

import {
  ZoeBuildPromptComposer,
  type ZoeBuildPromptSubmission,
} from "@/components/builder/ZoeBuildPromptComposer";

import type {
  ShopifyImportDraft,
} from "@/lib/import/shopify";

import {
  formatZoeBuildPlan,
  requestZoeBuildPlan,
} from "@/lib/build/requestZoeBuildPlan";

import WebPreview from "@zoeskoul/learner-workspace/runner/components/WebPreview";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";

import BuildWorkspaceClient from "./BuildWorkspaceClient";
import CommerceWorkspacePanel from "./CommerceWorkspacePanel";
import { PublishProjectButton } from "@/components/builder/PublishProjectButton";
import { useReactVitePreview } from "@/components/builder/useReactVitePreview";
import { PersistentReactPreviewSlot } from "@/components/builder/PersistentReactPreviewHost";

type BuildWorkspaceProps =
  Parameters<
    typeof BuildWorkspaceClient
  >[0];

export default function ProjectBuilderShell(props: {
  locale: string;
  project:
    BuildWorkspaceProps["project"];

  initialDeployment?:
    Parameters<
      typeof PublishProjectButton
    >[0]["initialDeployment"];
}) {
  const [mode, setMode] =
    useState<ZoeBuildMode>("preview");

  const [commerceOpen, setCommerceOpen] =
    useState(false);

  const [previewWorkspace, setPreviewWorkspace] =
    useState(props.project.workspace);
  const [previewSourceVersion, setPreviewSourceVersion] =
    useState(props.project.sourceVersion);
  const [codeDirty, setCodeDirty] =
    useState(false);

  const reactPreviewEnabled =
    props.project.stackId === "react-vite-v1";

  const reactPreview = useReactVitePreview({
    enabled: reactPreviewEnabled,
    buildProjectId: props.project.buildProjectId,
    sourceVersion: previewSourceVersion,
    workspace: previewWorkspace,
    allowDependencyBootstrap: !codeDirty,
  });

  const previewEntries = exportWorkspaceEntries(previewWorkspace.nodes);

  const [
    commerceCandidate,
    setCommerceCandidate,
  ] =
    useState<string | null>(
      null,
    );

  const [messages, setMessages] =
    useState<string[]>([]);

  const [
    pendingPlan,
    setPendingPlan,
  ] =
    useState<
      Awaited<
        ReturnType<
          typeof requestZoeBuildPlan
        >
      > |
      null
    >(null);

  const [
    applyingPlan,
    setApplyingPlan,
  ] =
    useState(false);

  const [
    applyPlanError,
    setApplyPlanError,
  ] =
    useState<string | null>(
      null,
    );

  const commerceEnabled =
    (
    props.project.stackId ===
      "commerce-static-v1" ||
    props.project.stackId ===
      "commerce-react-vite-v1"
  );

  function addMessage(
    message: string,
  ) {
    setMessages(
      (current) => [
        ...current,
        message,
      ],
    );

    setCommerceOpen(false);
  }

  async function planChange(
    submission: ZoeBuildPromptSubmission,
  ) {
    setPendingPlan(null);
    setApplyPlanError(null);

    addMessage(
      "Zoé is planning this change...",
    );

    try {
      const plan =
        await requestZoeBuildPlan(
          submission,
        );

      setPendingPlan(
        plan,
      );

      addMessage(
        formatZoeBuildPlan(
          plan,
          "This plan has not been applied to project source yet.",
        ),
      );
    } catch (error) {
      addMessage(
        error instanceof Error
          ? error.message
          : "Zoé could not create a change plan.",
      );
    }
  }

  async function applyPendingPlan() {
    if (
      !pendingPlan ||
      applyingPlan
    ) {
      return;
    }

    setApplyingPlan(true);
    setApplyPlanError(null);

    try {
      const response =
        await fetch(
          `/api/build/projects/${encodeURIComponent(
            props.project.buildProjectId,
          )}/apply-plan`,
          {
            method: "POST",

            credentials:
              "same-origin",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                baseVersion:
                  props.project.sourceVersion,

                specification:
                  pendingPlan.specification,
              }),
          },
        );

      const payload =
        await response.json() as {
          ok?: boolean;

          message?: string;

          apply?: {
            sourceVersion:
              number;
          };
        };

      if (
        !response.ok ||
        !payload.ok ||
        !payload.apply
      ) {
        throw new Error(
          payload.message ??
            "Plan could not be applied.",
        );
      }

      addMessage(
        `Plan applied to source version ${payload.apply.sourceVersion}.`,
      );

      setPendingPlan(null);

      // Reload only after the canonical source transaction succeeds.
      window.location.reload();
    } catch (error) {
      setApplyPlanError(
        error instanceof Error
          ? error.message
          : "Plan could not be applied.",
      );
    } finally {
      setApplyingPlan(false);
    }
  }

  function importShopify(
    draft:
      ShopifyImportDraft,
  ) {
    setCommerceCandidate(
      draft.hostname,
    );

    setMessages(
      (current) => [
        ...current,

        `Shopify address validated: ${draft.hostname}. No store connection has been created yet.`,
      ],
    );

    if (commerceEnabled) {
      setCommerceOpen(true);
    }
  }

  return (
    <div className="zb-project-frame">
      <aside
        className="zb-project-assistant-rail"
        aria-label="Zoé project assistant"
      >
        <header className="zb-project-assistant-header">
        <Link
          className="zb-project-rail-projects"
          href={`/${encodeURIComponent(props.locale)}/projects`}
          aria-label="Back to projects"
          title="Projects"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M14.5 6.5 9 12l5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>

          <div
            className="zb-project-assistant-avatar"
            aria-hidden="true"
          >
            Z
          </div>

          <div>
            <strong>
              Zoé
            </strong>

            <p>
              Design, build, and refine this project.
            </p>
          </div>
        </header>

        <div className="zb-project-assistant-thread">
          {messages.length === 0 ? (
            <div className="zb-project-assistant-empty">
              <strong>
                What should we build next?
              </strong>

              <p>
                Ask Zoé to change the design, content, layout, or project behavior.
              </p>
            </div>
          ) : (
            messages.map(
              (
                message,
                index,
              ) => (
                <article
                  className="zb-project-assistant-message"
                  key={`${index}:${message}`}
                >
                  {message}
                </article>
              ),
            )
          )}

          {pendingPlan ? (
            <section
              className="zb-project-assistant-plan"
              aria-label="Pending Zoé plan"
            >
              <div>
                <span className="zb-project-assistant-plan-status">
                  Plan ready
                </span>

                <strong>
                  Review and apply the proposed changes
                </strong>

                <p>
                  Nothing changes in project source until you apply this plan.
                </p>

                {applyPlanError ? (
                  <p
                    className="zb-project-assistant-plan-error"
                    role="alert"
                  >
                    {applyPlanError}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                className="zb-project-assistant-apply"
                disabled={applyingPlan}
                onClick={applyPendingPlan}
              >
                {applyingPlan
                  ? "Applying..."
                  : "Apply plan"}
              </button>
            </section>
          ) : null}
        </div>

        <div className="zb-project-assistant-composer">
          <ZoeBuildPromptComposer
                    onPrompt={planChange}
                    onShopifyImport={
                      importShopify
                    }
                    placeholder="Ask Zoé to build, change, or refine anything…"
                  />
        </div>
      </aside>

      <section className="zb-project-stage">
        <div
          className="zb-project-modebar"
          aria-label="Project workspace"
        >
          <span
            className="zb-project-modebar-title"
            title={props.project.title}
          >
            {props.project.title}
          </span>
          <div
            className="zb-project-mode-tabs"
            role="group"
            aria-label="Workspace view"
          >
            <button
              type="button"
              className="zb-project-mode-tab"
              data-active={
                !commerceOpen &&
                mode === "preview"
                  ? "true"
                  : "false"
              }
              aria-pressed={
                !commerceOpen &&
                mode === "preview"
              }
              onClick={() => {
                setCommerceOpen(false);
                setMode("preview");
              }}
            >
              <ProjectPreviewIcon className="zb-project-mode-icon" />
              Preview
            </button>

            <button
              type="button"
              className="zb-project-mode-tab"
              data-active={
                !commerceOpen &&
                mode === "code"
                  ? "true"
                  : "false"
              }
              aria-pressed={
                !commerceOpen &&
                mode === "code"
              }
              onClick={() => {
                setCommerceOpen(false);
                setMode("code");
              }}
            >
              <ProjectCodeIcon className="zb-project-mode-icon" />
              Code
            </button>

            {commerceEnabled ? (
              <button
                type="button"
                className="zb-project-mode-tab"
                data-active={
                  commerceOpen
                    ? "true"
                    : "false"
                }
                aria-pressed={commerceOpen}
                onClick={() => {
                  setCommerceOpen(true);
                }}
              >
                Commerce
              </button>
            ) : null}
          </div>

          <PublishProjectButton
            buildProjectId={props.project.buildProjectId}
            initialDeployment={props.initialDeployment}
          />
        </div>

        <div className="zb-project-stage-body">
    <main className="zb-builder-shell">

      <section className="zb-builder-stage">
        <div
          className="zb-project-preview-stage"
          hidden={commerceOpen || mode !== "preview"}
          aria-hidden={commerceOpen || mode !== "preview"}
        >
            {reactPreviewEnabled && reactPreview ? (
              <PersistentReactPreviewSlot
                buildProjectId={
                  props.project.buildProjectId
                }
                slotId="project-preview"
                preview={reactPreview}
                active={
                  !commerceOpen &&
                  mode === "preview"
                }
              />
            ) : (
              <WebPreview
                entries={previewEntries}
                title={`${props.project.title} preview`}
                sessionKey={props.project.buildProjectId}
              />
            )}
        </div>

        <div
          className="zb-code-stage"
          hidden={commerceOpen || mode !== "code"}
          aria-hidden={commerceOpen || mode !== "code"}
        >
          <BuildWorkspaceClient
            project={props.project}
            onWorkspaceSnapshot={setPreviewWorkspace}
            onSourceVersionChange={setPreviewSourceVersion}
            onDirtyChange={setCodeDirty}
            remoteWebPreview={reactPreviewEnabled ? reactPreview : null}
            remotePreviewActive={
              !commerceOpen && mode === "code"
            }
          />
        </div>


        {commerceOpen &&
        commerceEnabled ? (
          <CommerceWorkspacePanel
            project={
              props.project
            }
            candidateHostname={
              commerceCandidate
            }
          />
        ) : null}
      </section>


    </main>
        </div>
      </section>
    </div>
  );
}
