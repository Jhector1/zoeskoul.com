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
import type {
  WebPreviewCommerceRequest,
} from "@zoeskoul/learner-workspace/runner/components/WebPreview";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";

import BuildWorkspaceClient from "./BuildWorkspaceClient";
import SiteSettingsWorkspacePanel from "./SiteSettingsWorkspacePanel";
import StripeCheckoutReturnNotice from "./StripeCheckoutReturnNotice";
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

  const [settingsOpen, setSettingsOpen] =
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

  function hostedCheckoutRedirectUrl(
    value:
      unknown,
  ) {
    if (
      !value ||
      typeof value !==
        "object" ||
      Array.isArray(
        value,
      )
    ) {
      throw new Error(
        "The trusted commerce binding did not return a checkout result.",
      );
    }

    const raw =
      (
        value as
          Record<
            string,
            unknown
          >
      ).url;

    if (
      typeof raw !==
        "string" ||
      !raw.trim()
    ) {
      throw new Error(
        "The trusted commerce binding did not return a checkout URL.",
      );
    }

    let checkout:
      URL;

    try {
      checkout =
        new URL(
          raw,
        );
    } catch {
      throw new Error(
        "The trusted commerce binding returned an invalid checkout URL.",
      );
    }

    if (
      checkout.protocol !==
        "https:"
    ) {
      throw new Error(
        "Hosted checkout must use HTTPS.",
      );
    }

    return checkout.toString();
  }

  async function requestStaticPreviewCommerce(
    request:
      WebPreviewCommerceRequest,
  ) {
    const response =
      await fetch(
        `/api/build/projects/${encodeURIComponent(
          props.project.buildProjectId,
        )}/commerce/preview`,
        {
          method:
            "POST",

          credentials:
            "same-origin",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              method:
                request.method,
              input:
                request.input,
            }),
        },
      );

    const payload =
      await response
        .json()
        .catch(
          () =>
            null,
        ) as
          | {
              ok?:
                boolean;
              result?:
                unknown;
              message?:
                string;
            }
          | null;

    if (
      !response.ok ||
      !payload?.ok
    ) {
      throw new Error(
        payload?.message ??
          "Commerce preview request failed.",
      );
    }

    if (
      request.method ===
        "checkout.begin"
    ) {
      const checkoutUrl =
        hostedCheckoutRedirectUrl(
          payload.result,
        );

      /*
       * Static Preview stays opaque and never receives top-navigation
       * permission. The authenticated parent owns the provider-neutral
       * hosted-checkout redirect.
       *
       * Do not resolve this RPC after navigation begins. Generated storefront
       * source keeps its normal published-site location.assign behavior, but
       * Preview never reaches that line inside the iframe.
       */
      window.location.assign(
        checkoutUrl,
      );

      return await new Promise<never>(
        () => {},
      );
    }

    return payload.result;
  }

  function addMessage(
    message: string,
  ) {
    setMessages(
      (current) => [
        ...current,
        message,
      ],
    );

    setSettingsOpen(false);
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
      setSettingsOpen(true);
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
                !settingsOpen &&
                mode === "preview"
                  ? "true"
                  : "false"
              }
              aria-pressed={
                !settingsOpen &&
                mode === "preview"
              }
              onClick={() => {
                setSettingsOpen(false);
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
                !settingsOpen &&
                mode === "code"
                  ? "true"
                  : "false"
              }
              aria-pressed={
                !settingsOpen &&
                mode === "code"
              }
              onClick={() => {
                setSettingsOpen(false);
                setMode("code");
              }}
            >
              <ProjectCodeIcon className="zb-project-mode-icon" />
              Code
            </button>

            <button
              type="button"
              className="zb-project-mode-tab"
              data-active={settingsOpen ? "true" : "false"}
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              Site Settings
            </button>
          </div>

          <PublishProjectButton
            buildProjectId={props.project.buildProjectId}
            initialDeployment={props.initialDeployment}
          />
          {commerceEnabled && !settingsOpen && mode === "preview" ? (
            <StripeCheckoutReturnNotice buildProjectId={props.project.buildProjectId} />
          ) : null}
        </div>

        <div className="zb-project-stage-body">
    <main className="zb-builder-shell">

      <section className="zb-builder-stage">
        <div
          className="zb-project-preview-stage"
          hidden={settingsOpen || mode !== "preview"}
          aria-hidden={settingsOpen || mode !== "preview"}
        >
            {reactPreviewEnabled && reactPreview ? (
              <PersistentReactPreviewSlot
                buildProjectId={
                  props.project.buildProjectId
                }
                slotId="project-preview"
                preview={reactPreview}
                active={
                  !settingsOpen &&
                  mode === "preview"
                }
              />
            ) : (
              <WebPreview
                entries={previewEntries}
                title={`${props.project.title} preview`}
                sessionKey={props.project.buildProjectId}
                onCommerceRequest={
                  commerceEnabled
                    ? requestStaticPreviewCommerce
                    : undefined
                }
              />
            )}
        </div>

        <div
          className="zb-code-stage"
          hidden={settingsOpen || mode !== "code"}
          aria-hidden={settingsOpen || mode !== "code"}
        >
          <BuildWorkspaceClient
            project={props.project}
            onWorkspaceSnapshot={setPreviewWorkspace}
            onSourceVersionChange={setPreviewSourceVersion}
            onDirtyChange={setCodeDirty}
            remoteWebPreview={reactPreviewEnabled ? reactPreview : null}
            remotePreviewActive={
              !settingsOpen && mode === "code"
            }
            webPreviewCommerceRequest={
              commerceEnabled && !reactPreviewEnabled
                ? requestStaticPreviewCommerce
                : undefined
            }
          />
        </div>


        {settingsOpen ? (
          <SiteSettingsWorkspacePanel
            project={props.project}
            candidateHostname={commerceCandidate}
            commerceEnabled={commerceEnabled}
          />
        ) : null}
      </section>


    </main>
        </div>
      </section>
    </div>
  );
}
