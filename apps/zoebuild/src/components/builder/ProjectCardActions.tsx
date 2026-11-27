"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./ProjectCardActions.module.css";

export function ProjectCardActions({ href, title, children, refreshThumbnailHref }: {
  href: string;
  title: string;
  children: ReactNode;
  refreshThumbnailHref?: string;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !details.current?.contains(event.target) && details.current) {
        details.current.open = false;
      }
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      setCopyStatus("Project link copied.");
    } catch {
      setCopyStatus("Could not copy the project link.");
    }
  }

  return (
    <details ref={details} className={styles.actions} onToggle={() => setCopyStatus("")} onKeyDown={event => {
      if (event.key === "Escape" && details.current?.open) {
        event.preventDefault();
        details.current.open = false;
        trigger.current?.focus();
      }
    }}>
      <summary ref={trigger} className={styles.trigger} aria-label={`Actions for ${title}`}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>
        </svg>
      </summary>
      <div className={styles.panel}>
        <Link className={styles.item} href={href}>Open editor</Link>
        <a className={styles.item} href={href} target="_blank" rel="noopener noreferrer">Open in new tab</a>
        {refreshThumbnailHref && <Link className={styles.item} href={refreshThumbnailHref} prefetch={false}>Refresh thumbnail</Link>}
        <button className={styles.item} type="button" onClick={() => void copyLink()}>Copy project link</button>
        {copyStatus ? <p className={styles.status} role="status">{copyStatus}</p> : null}
        <div className={styles.divider}/>
        {children}
      </div>
    </details>
  );
}
