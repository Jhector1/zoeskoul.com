"use client";

import styles from "./ZoeThinkingPanel.module.css";
import MathMarkdown from "@zoeskoul/learner-workspace/ui/markdown/MathMarkdown";
import { deriveZoeThinkingActivity, type ZoeThinkingPhase } from "./zoeThinkingActivity";
export type { ZoeThinkingPhase } from "./zoeThinkingActivity";


/**
 * A restrained activity view, never a fabricated reasoning transcript.
 * Phase labels correspond to actual app events; text is limited to the
 * provider-supplied summary. Do not render raw/private chain of thought.
 */
export default function ZoeThinkingPanel({ busy, phase, summary }: Readonly<{
  busy: boolean;
  phase: ZoeThinkingPhase;
  summary: string;
}>) {
  const activity = deriveZoeThinkingActivity({ busy, phase, summary });
  if (!activity.visible) return null;
  const { cleaned, ready, failed, message } = activity;

  return (
    <section className={styles.panel} aria-label="Zoé work activity"
      data-state={activity.state}>
      <div className={styles.head}>
        <span className={busy ? styles.activity : ready ? styles.success : styles.error} aria-hidden="true">
          {busy ? <span className={styles.orbit} /> : ready ? "✓" : "!"}
        </span>
        <div className={styles.content}>
          <span className={styles.eyebrow}>{activity.eyebrow}</span>
          <span className={styles.phase} role="status" aria-live="polite" aria-atomic="true">
            <span key={message} className={styles.phaseText}>{message}</span>
            {busy ? <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span> : null}
          </span>
        </div>
      </div>
      {busy ? <div className={styles.progress} aria-hidden="true"><span /></div> : null}
      {busy && cleaned ? (
        <div className={styles.liveText} aria-live="off" aria-label="Model-supplied activity summary">
          <MathMarkdown content={cleaned} />
        </div>
      ) : null}
      {!busy && cleaned ? (
        <details className={styles.details}>
          <summary>View activity summary</summary>
          <div className={styles.richSummary}><MathMarkdown content={cleaned} /></div>
          <small>Model-supplied summary, not private reasoning.</small>
        </details>
      ) : null}
      {failed ? <p className={styles.failure}>No changes were applied by this request.</p> : null}
    </section>
  );
}
