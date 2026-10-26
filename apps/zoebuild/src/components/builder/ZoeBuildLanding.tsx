"use client";

import { useState } from "react";
import {isAiCreditShortage} from "@/lib/billing/creditShortage";

import {
  ZoeBuildModeTabs,
  type ZoeBuildMode,
} from "./ZoeBuildModeTabs";
import {
  ZoeBuildPromptComposer,
  type ZoeBuildPromptSubmission,
} from "./ZoeBuildPromptComposer";
import {
  formatZoeBuildPlan,
  requestZoeBuildPlan,
} from "@/lib/build/requestZoeBuildPlan";
import type {
  ShopifyImportDraft,
} from "@/lib/import/shopify";

export function ZoeBuildLanding() {
  const [mode, setMode] = useState<ZoeBuildMode>("preview");
  const [aiText, setAiText] = useState<string | null>(null);

  async function prompt(
    submission: ZoeBuildPromptSubmission,
  ) {
    setMode("ai");
    setAiText("Zoé is planning your build...");

    try {
      const plan = await requestZoeBuildPlan(submission);
      setAiText(formatZoeBuildPlan(plan));
    } catch (error) {
      if(isAiCreditShortage(error)){setAiText(null);throw error;}
      setAiText(
        error instanceof Error
          ? error.message
          : "Zoé could not create a build plan.",
      );
    }
  }

  function importShopify(draft: ShopifyImportDraft) {
    setAiText(
      `Shopify import ready: ${draft.hostname}. Connect Shopify to continue.`,
    );
    setMode("ai");
  }

  return (
    <main className="zb-builder-shell">
      <div className="zb-builder-toolbar">
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
          <div className="zb-stage-quiet">Code</div>
        ) : null}

        {mode === "ai" ? (
          <div className="zb-ai-panel">
            {aiText ? (
              <div className="zb-ai-message zb-ai-message-plan">
                {aiText}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="zb-prompt-dock">
        <ZoeBuildPromptComposer
          onPrompt={prompt}
          onShopifyImport={importShopify}
        />
      </div>
    </main>
  );
}
