"use client";

import styles from "./HistoryPreviewTransition.module.css";
import { historyPreviewTransitionCopy } from "@/lib/build/historyPreviewTransitionCopy";

export default function HistoryPreviewTransition(props: Readonly<{
  target: number;
  sourceVersion: number | null;
  failed: boolean;
  previewMessage: string | null;
  previewState: string;
  onRetry?: () => void;
  onReload: () => void;
}>) {
  const copy = historyPreviewTransitionCopy(props);
  return <div className={styles.overlay} role="status" aria-live="polite"
    aria-busy={!props.failed} data-testid="zoebuild-history-switch-overlay">
    <div className={styles.content}>
      {!props.failed ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <h3>{copy.title}</h3>
      <p>{copy.description}</p>
      {props.failed ? <div className={styles.actions}>
        {props.sourceVersion !== null && props.onRetry ? <button
          type="button" className={styles.primary} onClick={props.onRetry}>Retry preview</button> : null}
        <button type="button" onClick={props.onReload}>Reload saved project</button>
      </div> : null}
    </div>
  </div>;
}
