"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AssignmentCard = {
  id: string;
  title: string;
  description: string | null;
  availability: "draft" | "upcoming" | "open" | "past_due" | "closed";
  availableFrom: string | Date | null;
  dueAt: string | Date | null;
  owner: { name: string | null; email: string | null };
  subject: { title: string; description: string | null; slug: string };
  enrolled: boolean;
};

function dateLabel(value: string | Date | null) {
  return value ? new Date(value).toLocaleString() : null;
}

export default function AssignedCourseCard({ assignment }: { assignment: AssignmentCard }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canOpen = assignment.availability === "open" || assignment.availability === "past_due";

  async function openCourse() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/learning-assignments/${assignment.id}/start`, { method: "POST" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error ?? "Could not open this course.");
      setBusy(false);
      return;
    }
    router.push(json.href);
  }

  return (
    <article className="ui-page-surface overflow-hidden">
      <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-section-kicker">Assigned course</div>
            <h2 className="mt-1 ui-title-sm">{assignment.title}</h2>
            <p className="mt-1 ui-meta">{assignment.subject.title}</p>
          </div>
          <span className="rounded-full border border-[rgb(var(--ui-border)/1)] px-2.5 py-1 text-[11px] font-semibold capitalize text-[rgb(var(--ui-text-muted)/1)]">
            {assignment.availability.replace("_", " ")}
          </span>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        <p className="text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">
          {assignment.description || assignment.subject.description || "Complete this private interactive course in ZoeSkoul."}
        </p>
        <div className="grid gap-1 text-xs text-[rgb(var(--ui-text-muted)/0.86)]">
          <div>Instructor: {assignment.owner.name || assignment.owner.email || "ZoeSkoul instructor"}</div>
          {assignment.availableFrom ? <div>Opens: {dateLabel(assignment.availableFrom)}</div> : null}
          {assignment.dueAt ? <div>Due: {dateLabel(assignment.dueAt)}</div> : null}
          <div>Progress: {assignment.enrolled ? "Started" : "Not started"}</div>
        </div>
        {error ? <div className="ui-surface-danger px-3 py-2 text-xs">{error}</div> : null}
        <button
          type="button"
          onClick={openCourse}
          disabled={!canOpen || busy}
          className="ui-btn-primary justify-self-start disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Opening…" : assignment.enrolled ? "Continue course" : "Start course"}
        </button>
      </div>
    </article>
  );
}
