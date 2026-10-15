"use client";

import { useState } from "react";

import {
  ZoeBuildModeTabs,
  type ZoeBuildMode,
} from "@/components/builder/ZoeBuildModeTabs";
import {
  ZoeBuildPromptComposer,
  type ZoeBuildPromptSubmission,
} from "@/components/builder/ZoeBuildPromptComposer";
import {
  formatZoeBuildPlan,
  requestZoeBuildPlan,
} from "@/lib/build/requestZoeBuildPlan";
import type {
  ShopifyImportDraft,
} from "@/lib/import/shopify";

import BuildWorkspaceClient from "./BuildWorkspaceClient";

type BuildWorkspaceProps =
  Parameters<typeof BuildWorkspaceClient>[0];

export default function ProjectBuilderShell(props: {
  project: BuildWorkspaceProps["project"];
}) {
  const [mode, setMode] = useState<ZoeBuildMode>("code");
  const [messages, setMessages] = useState<string[]>([]);

  function addMessage(message: string) {
    setMessages((current) => [...current, message]);
    setMode("ai");
  }

  async function planChange(
    submission: ZoeBuildPromptSubmission,
  ) {
    const mediaLabel = submission.files.length
      ? ` + ${submission.files.length} media file${submission.files.length === 1 ? "" : "s"}`
      : "";

    addMessage(
      `${submission.prompt || "Media request"}${mediaLabel}`,
    );
    addMessage("Zoé is planning this change...");

    try {
      const plan = await requestZoeBuildPlan(submission);
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

  function importShopify(draft: ShopifyImportDraft) {
    addMessage(
      `Shopify import ready: ${draft.hostname}. Connect Shopify to continue.`,
    );
  }

  return (
    <main className="zb-builder-shell">
      <div className="zb-builder-toolbar">
        <span className="zb-project-title">
          {props.project.title}
        </span>

        <ZoeBuildModeTabs
          value={mode}
          onChange={setMode}
        />
      </div>

      <section className="zb-builder-stage">
        {mode === "preview" ? (
          <div className="zb-stage-quiet">Preview</div>
        ) : null}

        {mode === "code" ? (
          <div className="zb-code-stage">
            <BuildWorkspaceClient project={props.project} />
          </div>
        ) : null}

        {mode === "ai" ? (
          <div className="zb-ai-panel">
            {messages.map((message, index) => (
              <div
                key={`${index}-${message}`}
                className="zb-ai-message zb-ai-message-plan"
              >
                {message}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="zb-prompt-dock">
        <ZoeBuildPromptComposer
          onPrompt={planChange}
          onShopifyImport={importShopify}
          placeholder="Ask Zoé to plan a change..."
        />
      </div>
    </main>
  );
}
