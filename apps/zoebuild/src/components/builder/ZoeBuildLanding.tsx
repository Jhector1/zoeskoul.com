"use client";

import { useState } from "react";
import { ZoeBuildPromptComposer, type ZoeBuildPromptSubmission } from "./ZoeBuildPromptComposer";
import { formatZoeBuildPlan, requestZoeBuildPlan } from "@/lib/build/requestZoeBuildPlan";
import styles from "./ZoeBuildLanding.module.css";

const HOME_ACTION_WORDS = ["build", "design", "launch"] as const;

export function ZoeBuildLanding() {
  const [aiText, setAiText] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);

  async function prompt(submission: ZoeBuildPromptSubmission) {
    setPlanning(true);
    setAiText(null);
    try {
      const plan = await requestZoeBuildPlan(submission);
      setAiText(formatZoeBuildPlan(plan));
    } finally {
      // A rejection propagates to the shared composer, which preserves the draft.
      setPlanning(false);
    }
  }

  return (
    <main className={styles.home}>
      <section className={styles.center} aria-labelledby="zb-home-heading">
        <div className={styles.intro}>
          <h1 id="zb-home-heading" className={styles.heading} aria-label="What will you build today?">
            What will you{" "}
            <span className={styles.wordWindow} aria-hidden="true">
              {HOME_ACTION_WORDS.map((word) => (
                <span key={word}>{word}</span>
              ))}
            </span>{" "}
            today?
          </h1>
          <p>Start with a simple prompt and shape it with Zoé.</p>
        </div>
        <ZoeBuildPromptComposer
          variant="home"
          placeholder="Ask Zoé…"
          onPrompt={prompt}
        />
        {planning ? <p className={styles.status} role="status">Zoé is planning your build…</p> : null}
        {aiText ? (
          <section className={styles.result} aria-label="Build plan" aria-live="polite">
            <h2>Your build plan</h2>
            <div>{aiText}</div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
