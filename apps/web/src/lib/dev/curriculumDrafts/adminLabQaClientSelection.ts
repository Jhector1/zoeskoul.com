/** Client-side visibility guard; server still validates canonical draft source and grant. */
export type DraftAdminQaSelection = {
  catalog: "linux";
  subject: "linux";
  module: string;
  topic: string;
};

/** Accept only the three explicitly approved Course 2 module/topic pairs. */
export function approvedDraftAdminQaSelection(search: string): DraftAdminQaSelection | null {
  const query = new URLSearchParams(search);
  // Duplicate identity parameters make the active topic ambiguous. Never
  // authorize a panel when two URL readers might select different values.
  for (const key of ["catalog", "subject", "moduleDir", "topicDir"] as const) {
    if (query.getAll(key).length !== 1) return null;
  }
  const catalog = query.get("catalog");
  const subject = query.get("subject");
  const module = query.get("moduleDir");
  const topic = query.get("topicDir");
  if (catalog !== "linux" || subject !== "linux" || !module || !topic) return null;
  const approved =
    (module === "linux-module-3-users-groups-troubleshooting" &&
      (topic === "sudo-root-concepts" || topic === "ownership-administration-concepts")) ||
    (module === "linux-module-4-secure-project-capstone" &&
      topic === "final-capstone-secure-project");
  return approved ? {catalog, subject, module, topic} : null;
}

/** Fail closed if the browser location has moved since the panel was mounted. */
export function matchesDraftAdminQaLocation(search: string, selected: DraftAdminQaSelection): boolean {
  const current = approvedDraftAdminQaSelection(search);
  return Boolean(current && current.catalog === selected.catalog &&
    current.subject === selected.subject && current.module === selected.module &&
    current.topic === selected.topic);
}
