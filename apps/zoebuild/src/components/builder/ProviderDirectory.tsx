"use client";

import type { ProviderPresentation } from "@/lib/integrations/providerDirectoryCatalog";
import styles from "./ProviderDirectory.module.css";

export type ProviderDirectoryStatus = "active" | "built-in" | "connected" | "available" | "attention" | "unverified" | "checking" | "unavailable" | "browse";
export type ProviderDirectoryEntry = Readonly<{
  provider: ProviderPresentation;
  status: ProviderDirectoryStatus;
  note?: string;
}>;

const STATUS: Record<ProviderDirectoryStatus, string> = {
  active: "Active",
  "built-in": "Built in",
  connected: "Connected",
  available: "Available to connect",
  attention: "Needs attention",
  unverified: "Status unverified",
  checking: "Checking status",
  unavailable: "Not available",
  browse: "View category",
};

export default function ProviderDirectory(props: Readonly<{
  title: string;
  description: string;
  entries: readonly ProviderDirectoryEntry[];
  onOpen: (id: string) => void;
  actionLabel?: string;
}>) {
  return (
    <section className={styles.directory} aria-label={props.title}>
      <header className={styles.heading}>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </header>
      <div className={styles.grid} role="list">
        {props.entries.map(({ provider, status, note }) => {
          const disabled = status === "unavailable" || status === "checking";
          return (
            <div key={provider.id} role="listitem">
              <button
                type="button"
                className={styles.card}
                data-status={status}
                disabled={disabled}
                onClick={() => props.onOpen(provider.id)}
                aria-label={`${provider.name}: ${STATUS[status]}`}
              >
                <span className={styles.cardTop}>
                  <span className={styles.brand} aria-hidden="true">
                    <span className={styles.fallback}>{provider.initials}</span>
                    {provider.simpleIconSlug ? (
                      // The logo is a public, non-secret static brand asset; initials remain the fallback.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.logo} src={`https://cdn.simpleicons.org/${provider.simpleIconSlug}`}
                        alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ) : null}
                  </span>
                  <span className={styles.identity}>
                    <strong>{provider.name}</strong>
                    <span className={styles.state} data-status={status}>{STATUS[status]}</span>
                  </span>
                </span>
                <span className={styles.description}>{provider.description}</span>
                <span className={styles.bottom}>
                  <span className={styles.note}>{note ?? (disabled ? "Connector not implemented or not configured." : "")}</span>
                  <span className={styles.action}>
                    {status === "unavailable" ? "Unavailable" : status === "checking" ? "Checking…" : props.actionLabel ?? (status === "available" ? "Connect" : status === "unverified" ? "Inspect" : status === "browse" ? "Browse" : "Open settings")}
                    {!disabled ? " →" : ""}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
