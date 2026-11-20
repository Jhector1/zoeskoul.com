"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createStarterProjectSpecification, INITIAL_BUILD_PROMPT_MAX_CHARS, storeInitialBuildPrompt } from "@/lib/build/starterProjectSpecifications";

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
  const [idea, setIdea] = useState("");
  const createdProjectRef = useRef<string | null>(null);
  const submitLock = useRef(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
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
    if (submitLock.current || submitting || createdProjectRef.current || !name.trim()) return;
    submitLock.current = true;
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
      // Once the creation succeeds, never send another POST for a failed draft handoff.
      createdProjectRef.current = projectId;
      setCreatedProjectId(projectId);
      if (idea.trim()) {
        let stored = false;
        try { stored = storeInitialBuildPrompt(window.sessionStorage, projectId, idea); }
        catch { /* Storage access may be denied before the helper is called. */ }
        if (!stored) {
          setError("Project created. This browser could not transfer your idea. Copy it below, then open the project and paste it into Zoé.");
          return;
        }
      }
      openCreatedProject(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project could not be created.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  function openCreatedProject(projectId: string) {
    router.push(`/${encodeURIComponent(locale)}/projects/${encodeURIComponent(projectId)}`);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="zb-create-project-trigger" onClick={() => {
        // A successful creation owns its project even if browser navigation needs retry.
        if (createdProjectRef.current) { openCreatedProject(createdProjectRef.current); return; }
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
                  Start with TanStack Start. Describe any application you want to build, or begin with a blank project.
                </p>
              </div>
              <button type="button" className="zb-create-project-close"
                aria-label="Close create project" disabled={submitting}
                onClick={() => { setOpen(false); setError(null); }}>×</button>
            </div>
            <form className="zb-create-project-form" onSubmit={submit}>
              <label className="zb-create-project-label">
                Project name
                <input autoFocus required disabled={submitting || Boolean(createdProjectId)} maxLength={80} value={name} onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }} placeholder="My new project" className="zb-create-project-input" />
              </label>
              <label className="zb-create-project-label">
                What would you like to build? (optional)
                <textarea className="zb-create-project-input" rows={4}
                  maxLength={INITIAL_BUILD_PROMPT_MAX_CHARS} value={idea}
                  readOnly={submitting || Boolean(createdProjectId)}
                  placeholder="Describe your idea in your own words…"
                  onChange={(event) => setIdea(event.target.value)} />
              </label>
              <p className="zb-create-project-description">
                Your idea opens as a draft in Zoé. Submit it when you are ready to generate.
              </p>
              {error ? <div className="zb-create-project-error" role="alert">{error}</div> : null}
              <div className="zb-create-project-actions">
                <button type="button" className="zb-create-project-secondary" disabled={submitting}
                  onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
                {createdProjectId ? <button type="button" className="zb-create-project-primary"
                  onClick={() => openCreatedProject(createdProjectId)}>Open project</button> :
                <button type="submit" className="zb-create-project-primary"
                  disabled={submitting || !name.trim()}>
                  {submitting ? "Creating…" : "Create project"}
                </button>}
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
