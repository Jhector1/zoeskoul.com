"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createStarterProjectSpecification } from "@/lib/build/starterProjectSpecifications";

type Props = { locale: string };
type CreatePayload = {
  ok?: boolean;
  project?: { buildProjectId?: string };
  message?: string;
} | null;

export default function CreateBuildProjectClient({ locale }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setOpen(false);
        setError(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/build/projects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specification: createStarterProjectSpecification(name) }),
      });
      const payload = (await response.json().catch(() => null)) as CreatePayload;
      const projectId = payload?.project?.buildProjectId;
      if (!response.ok || payload?.ok !== true || !projectId) {
        throw new Error(payload?.message?.trim() || "Project could not be created.");
      }
      router.push(`/${encodeURIComponent(locale)}/projects/${encodeURIComponent(projectId)}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project could not be created.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" className="zb-create-project-trigger" onClick={() => {
        setOpen(true);
        setError(null);
      }}>
        <span aria-hidden="true" className="zb-create-project-plus">+</span>
        New project
      </button>
      {open ? (
        <div className="zb-create-project-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setOpen(false);
        }}>
          <section className="zb-create-project-dialog" role="dialog" aria-modal="true"
            aria-labelledby="zb-create-project-title" aria-describedby="zb-create-project-description">
            <div className="zb-create-project-heading">
              <div>
                <div className="ui-section-kicker">Zoé Build</div>
                <h2 id="zb-create-project-title" className="zb-create-project-title">Create a project</h2>
                <p id="zb-create-project-description" className="zb-create-project-description">
                  Start with TanStack Start. Tell Zoé what you want to build after opening your project.
                </p>
              </div>
              <button type="button" className="zb-create-project-close"
                aria-label="Close create project" disabled={submitting}
                onClick={() => { setOpen(false); setError(null); }}>×</button>
            </div>
            <form className="zb-create-project-form" onSubmit={submit}>
              <label className="zb-create-project-label">
                Project name
                <input autoFocus required maxLength={80} value={name} onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }} placeholder="My new project" className="zb-create-project-input" />
              </label>
              {error ? <div className="zb-create-project-error" role="alert">{error}</div> : null}
              <div className="zb-create-project-actions">
                <button type="button" className="zb-create-project-secondary" disabled={submitting}
                  onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
                <button type="submit" className="zb-create-project-primary"
                  disabled={submitting || !name.trim()}>
                  {submitting ? "Creating…" : "Create project"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
