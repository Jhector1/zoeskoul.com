"use client";

import { useRef, useState } from "react";
import CommerceWorkspacePanel from "./CommerceWorkspacePanel";
import ProviderDirectory, { type ProviderDirectoryEntry } from "@/components/builder/ProviderDirectory";
import { PROVIDER_PRESENTATIONS, type ProviderDirectoryCategory } from "@/lib/integrations/providerDirectoryCatalog";
import styles from "./SiteSettingsWorkspacePanel.module.css";

export type Section =
  | "general"
  | "commerce"
  | "payments"
  | "marketing"
  | "databases"
  | "seo"
  | "domains"
  | "integrations";

const SECTIONS: readonly { id: Section; title: string; description: string }[] = [
  { id: "general", title: "General", description: "Project information" },
  { id: "commerce", title: "Store & commerce", description: "Products, cart and orders" },
  { id: "payments", title: "Payments", description: "Providers, webhooks and environments" },
  { id: "marketing", title: "Email & marketing", description: "Campaigns and email providers" },
  { id: "databases", title: "Databases", description: "Project databases and backend services" },
  { id: "seo", title: "SEO & analytics", description: "Discoverability and measurement" },
  { id: "domains", title: "Domains & publishing", description: "Site addresses and release settings" },
  { id: "integrations", title: "Integrations", description: "Connected external services" },
];

const DIRECTORY_CATEGORIES: readonly ProviderDirectoryCategory[] = ["commerce", "payments", "marketing", "databases", "seo"];
const CATEGORY_TITLES: Readonly<Record<ProviderDirectoryCategory, string>> = {
  commerce: "Store & commerce", payments: "Payments", marketing: "Email & marketing",
  databases: "Databases", seo: "SEO & analytics",
};

export default function SiteSettingsWorkspacePanel(props: {
  project: Readonly<{ buildProjectId: string; title: string; stackId: string | null }>;
  commerceEnabled: boolean;
  candidateHostname?: string | null;
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(
    props.initialSection ?? ((props.candidateHostname && props.commerceEnabled) ? "commerce" : "general"),
  );
  const selected = SECTIONS.find((entry) => entry.id === section)!;
  const contentRef = useRef<HTMLDivElement>(null);
  const navigate = (next: Section) => {
    setSection(next);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };
  const resetContentScroll = () => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

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
            onClick={() => navigate(entry.id)}
            aria-current={section === entry.id ? "page" : undefined}
          >
            <strong>{entry.title}</strong>
            <small>{entry.description}</small>
          </button>
        ))}
      </nav>
      <div className={styles.content} ref={contentRef}>
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
              key={`${section}:${props.project.buildProjectId}`}
              project={props.project}
              commerceEnabled={props.commerceEnabled}
              candidateHostname={props.candidateHostname}
              section={section}
              onNavigate={resetContentScroll}
            />
          ) : (
            <section className={styles.page}>
              <div className="zb-commerce-candidate" role="status">
                <strong>Commerce is not enabled</strong>
                <p>Commerce is available when enabled in this React project's specification. No store or payment connection has been created for this project.</p>
              </div>
              <ProviderDirectory
                title={selected.title}
                description="These providers are not available for the current project's stack."
                entries={PROVIDER_PRESENTATIONS[section].map((provider): ProviderDirectoryEntry => ({
                  provider, status: "unavailable", note: "Enable a supported commerce project first.",
                }))}
                onOpen={() => { /* No commerce stack to authorize. */ }}
              />
            </section>
          )
        ) : section === "integrations" ? (
          <section className={styles.page}>
            <ProviderDirectory
              title="Integrations"
              description="Browse integrations by capability. Configuration and secrets remain in their owning settings category."
              entries={DIRECTORY_CATEGORIES.map((id): ProviderDirectoryEntry => ({
                provider: { id, name: CATEGORY_TITLES[id], description: `Browse ${CATEGORY_TITLES[id].toLowerCase()} providers.`, initials: id === "databases" ? "DB" : id === "marketing" ? "@" : id === "commerce" ? "Z" : id === "payments" ? "$" : "A" },
                status: "browse",
              }))}
              onOpen={(id) => { if (DIRECTORY_CATEGORIES.includes(id as ProviderDirectoryCategory)) navigate(id as ProviderDirectoryCategory); }}
              actionLabel="Browse"
            />
          </section>
        ) : section === "marketing" || section === "seo" || section === "databases" ? (
          <section className={styles.page}>
            <ProviderDirectory
              title={selected.title}
              description="Explore supported service categories. Connections become available only after an authorized backend connector is implemented and configured."
              entries={PROVIDER_PRESENTATIONS[section].map((provider): ProviderDirectoryEntry => ({
                provider,
                status: "unavailable",
                note: "Connector not configured in ZoeBuild yet.",
              }))}
              onOpen={() => { /* Disabled until a backend-owned connection flow exists. */ }}
            />
          </section>
        ) : (
          <section className={styles.page}>
            <span className="zb-commerce-kicker">{selected.title}</span>
            <h2>{selected.title}</h2>
            <p>{selected.description} will be configured here when the corresponding secure backend integration is available.</p>
            <p className={styles.note}>Not configured — no connection workflow is available in this category yet.</p>
          </section>
        )}
      </div>
    </div>
  );
}
