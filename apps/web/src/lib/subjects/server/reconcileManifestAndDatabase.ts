export type ManifestCatalog = { slug: string; status: string; subjects: readonly string[] };
export type ManifestCourse = { slug: string; status: string };
export type StoredCatalog = { slug: string; status: string };
export type StoredCourse = { slug: string; status: string; catalogSlug: string | null };
export type DiscoveryOverride = { kind: string; slug: string; hidden: boolean };
export type ReconciliationIssueCode =
  | "catalog_not_seeded" | "active_course_not_seeded" | "planned_course_not_seeded"
  | "stored_catalog_not_in_manifest" | "stored_course_not_in_manifest"
  | "course_catalog_mismatch" | "catalog_status_mismatch" | "course_status_mismatch"
  | "orphaned_override" | "course_manifest_membership_missing" | "duplicate_course_membership";
export type ReconciliationIssue = { kind: "catalog" | "course" | "override"; slug: string; code: ReconciliationIssueCode; message: string };
export type ReconciliationInput = {
  manifestCatalogs: readonly ManifestCatalog[];
  manifestCourses: readonly ManifestCourse[];
  storedCatalogs: readonly StoredCatalog[];
  storedCourses: readonly StoredCourse[];
  overrides: readonly DiscoveryOverride[];
};

/**
 * Read-only manifest↔DB audit. Never mutate a catalog, course, enrollment or override.
 * Manifest membership is authoritative; DB-only records are retained for old progress.
 * Visibility overrides are independent of seed-managed publication/status fields.
 */
export function reconcileManifestAndDatabase(input: ReconciliationInput) {
  const issues: ReconciliationIssue[] = [];
  const manifestCatalogs = new Map(input.manifestCatalogs.map(x => [x.slug,x]));
  const manifestCourses = new Map(input.manifestCourses.map(x => [x.slug,x]));
  const dbCatalogs = new Map(input.storedCatalogs.map(x => [x.slug,x]));
  const dbCourses = new Map(input.storedCourses.map(x => [x.slug,x]));
  const courseCatalog = new Map<string,string>();
  const issue = (kind:ReconciliationIssue["kind"],slug:string,code:ReconciliationIssueCode,message:string) => {issues.push({kind,slug,code,message});};

  for (const c of input.manifestCatalogs) {
    const stored = dbCatalogs.get(c.slug);
    if (!stored) issue("catalog",c.slug,"catalog_not_seeded","Manifest-only catalog; DB record may intentionally be absent for discovery.");
    else if (stored.status !== c.status) issue("catalog",c.slug,"catalog_status_mismatch",`Manifest status ${c.status}; database status ${stored.status}. Seed would reconcile lifecycle status.`);
    const seen = new Set<string>();
    for (const slug of c.subjects) {
      if (seen.has(slug) || courseCatalog.has(slug)) {
        issue("course",slug,"duplicate_course_membership","Course appears more than once in manifest catalog membership.");
      }
      seen.add(slug);
      if (!courseCatalog.has(slug)) courseCatalog.set(slug,c.slug);
    }
  }
  for (const c of input.storedCatalogs) if (!manifestCatalogs.has(c.slug))
    issue("catalog",c.slug,"stored_catalog_not_in_manifest","Database-only catalog: preserve record; review retirement manually.");

  for (const c of input.manifestCourses) {
    const expectedCatalog=courseCatalog.get(c.slug);
    if (!expectedCatalog) issue("course",c.slug,"course_manifest_membership_missing","Manifest course is not listed in a manifest catalog.");
    const stored = dbCourses.get(c.slug);
    if (!stored) issue("course",c.slug,c.status === "active" ? "active_course_not_seeded":"planned_course_not_seeded",c.status === "active"
      ? "Active manifest-only course: DB seeding may be unnecessary. Seed selectively only if enrollment or progress requires a persisted course row."
      : "Non-active manifest-only course; DB record may intentionally be absent.");
    else {
      if (stored.status !== c.status) issue("course",c.slug,"course_status_mismatch",`Manifest status ${c.status}; database status ${stored.status}.`);
      if (expectedCatalog && stored.catalogSlug !== expectedCatalog)
        issue("course",c.slug,"course_catalog_mismatch",`Manifest catalog ${expectedCatalog}; database catalog ${stored.catalogSlug ?? "none"}.`);
    }
  }
  for (const c of input.storedCourses) if (!manifestCourses.has(c.slug))
    issue("course",c.slug,"stored_course_not_in_manifest","Database-only course: keep enrollment and progress, review archival manually.");
  for (const override of input.overrides) {
    const exists=override.kind === "course" ? manifestCourses.has(override.slug) : override.kind === "catalog" ? manifestCatalogs.has(override.slug) : false;
    if (!exists) issue("override",override.slug,"orphaned_override",`Discovery override (${override.kind}) has no matching manifest entry; preserve until reviewed.`);
  }
  issues.sort((a,b)=>a.kind.localeCompare(b.kind)||a.slug.localeCompare(b.slug)||a.code.localeCompare(b.code));
  return {
    issues,
    summary:{
      manifestCatalogs:manifestCatalogs.size,manifestCourses:manifestCourses.size,
      storedCatalogs:dbCatalogs.size,storedCourses:dbCourses.size,
      unseededActiveCourses:issues.filter(x=>x.code==="active_course_not_seeded").length,
      orphanedOverrides:issues.filter(x=>x.code==="orphaned_override").length,
    },
  };
}
