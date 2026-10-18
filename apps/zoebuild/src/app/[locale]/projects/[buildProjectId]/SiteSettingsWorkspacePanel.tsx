"use client";

import { useState } from "react";
import CommerceWorkspacePanel from "./CommerceWorkspacePanel";
import styles from "./SiteSettingsWorkspacePanel.module.css";

type Section =
  | "general"
  | "commerce"
  | "payments"
  | "marketing"
  | "seo"
  | "domains"
  | "integrations";

const SECTIONS: readonly { id: Section; title: string; description: string }[] = [
  { id: "general", title: "General", description: "Project information" },
  { id: "commerce", title: "Store & commerce", description: "Products, cart and orders" },
  { id: "payments", title: "Payments", description: "Providers, webhooks and environments" },
  { id: "marketing", title: "Email & marketing", description: "Campaigns and email providers" },
  { id: "seo", title: "SEO & analytics", description: "Discoverability and measurement" },
  { id: "domains", title: "Domains & publishing", description: "Site addresses and release settings" },
  { id: "integrations", title: "Integrations", description: "Connected external services" },
];

export default function SiteSettingsWorkspacePanel(props: {
  project: Readonly<{ buildProjectId: string; title: string; stackId: string | null }>;
  commerceEnabled: boolean;
  candidateHostname?: string | null;
}) {
  const [section, setSection] = useState<Section>(
    props.candidateHostname && props.commerceEnabled ? "commerce" : "general",
  );
  const selected = SECTIONS.find((entry) => entry.id === section)!;

  return (
    <div className={styles.root} aria-label="Site settings">
      <nav className={styles.navigation} aria-label="Site settings sections">
        <div className={styles.navTitle}>Site Settings</div>
        {SECTIONS.map((entry) => (
          <button
            key={entry.id}
            className={styles.navItem}
            data-active={section === entry.id ? "true" : "false"}
            type="button"
            onClick={() => setSection(entry.id)}
            aria-current={section === entry.id ? "page" : undefined}
          >
            <strong>{entry.title}</strong>
            <small>{entry.description}</small>
          </button>
        ))}
      </nav>
      <div className={styles.content}>
        {section === "general" ? (
          <section className={styles.page}>
            <span className="zb-commerce-kicker">General</span>
            <h2>Project settings</h2>
            <p>Manage your project and its connected services from one place.</p>
            <dl className={styles.details}>
              <div><dt>Project</dt><dd>{props.project.title}</dd></div>
              <div><dt>Framework</dt><dd>{props.project.stackId ?? "Not selected"}</dd></div>
              <div><dt>Store support</dt><dd>{props.commerceEnabled ? "Available" : "Not configured for this project"}</dd></div>
            </dl>
            <p className={styles.note}>Project metadata editing is not available on this page yet. Existing project settings are unchanged.</p>
          </section>
        ) : section === "commerce" || section === "payments" ? (
          props.commerceEnabled ? (
            <CommerceWorkspacePanel
              project={props.project}
              candidateHostname={props.candidateHostname}
              section={section}
            />
          ) : (
            <section className={styles.page}>
              <span className="zb-commerce-kicker">{selected.title}</span>
              <h2>Commerce is not enabled</h2>
              <p>This project has no registered commerce stack. No store or payment connection has been created.</p>
            </section>
          )
        ) : (
          <section className={styles.page}>
            <span className="zb-commerce-kicker">{selected.title}</span>
            <h2>{selected.title}</h2>
            <p>{selected.description} will be configured here when the corresponding secure backend integration is available.</p>
            <p className={styles.note}>Not configured — no connection, credentials, or settings have been created.</p>
          </section>
        )}
      </div>
    </div>
  );
}
