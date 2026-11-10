import type {
  LearningVisibilityAdminResponse,
  LearningVisibilityChangeResponse,
  LearningVisibilityItem,
} from "@zoeskoul/api-contracts";
import { isDiscoveryHidden } from "@zoeskoul/db";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin/requireAdmin";
import {
  isAppOriginAllowed,
  isAppMutationOriginAllowed,
  appCorsJson,
  appCorsPreflight,
  applyAppCorsHeaders,
} from "@/lib/http/appCors";
import { prisma } from "@/lib/prisma";
import {
  getResolvedCatalogMap,
  getResolvedSubjectCardMap,
} from "@/lib/subjects/server/resolveSubjectPresentation";
import { setHiddenDiscovery } from "@/lib/subjects/server/learningDiscoveryVisibility";
import { reconcileManifestAndDatabase } from "@/lib/subjects/server/reconcileManifestAndDatabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["catalog", "course"]),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  hidden: z.boolean(),
}).strict();

export async function OPTIONS(req: Request) {
  return appCorsPreflight(req);
}

/** Read-only inventory for the independent Admin app. Never seed or mutate here. */
export async function GET(req: Request) {
  if (!isAppOriginAllowed(req)) {
    return appCorsJson(req, { error: "Invalid request origin" }, { status: 403 });
  }
  const denied = await requireAdmin(req);
  if (denied) return applyAppCorsHeaders(req, denied);

  const [catalogMap, courseMap, storedCatalogs, storedCourses] = await Promise.all([
    getResolvedCatalogMap(),
    getResolvedSubjectCardMap(),
    prisma.practiceCatalog.findMany({ select: { slug: true, status: true, meta: true } }),
    prisma.practiceSubject.findMany({
      select: { slug: true, status: true, meta: true, catalog: { select: { slug: true } } },
    }),
  ]);

  const catalogBySlug = new Map(storedCatalogs.map(row => [row.slug, row]));
  const courseBySlug = new Map(storedCourses.map(row => [row.slug, row]));
  const overrides = [
    ...storedCatalogs.filter(row => isDiscoveryHidden(row.meta))
      .map(row => ({ kind: "catalog" as const, slug: row.slug, hidden: true })),
    ...storedCourses.filter(row => isDiscoveryHidden(row.meta))
      .map(row => ({ kind: "course" as const, slug: row.slug, hidden: true })),
  ];

  const audit = reconcileManifestAndDatabase({
    manifestCatalogs: Object.values(catalogMap).map(item => ({
      slug: item.slug, status: item.status, subjects: item.subjects.map(subject => subject.slug),
    })),
    manifestCourses: Object.values(courseMap).map(item => ({ slug: item.slug, status: item.status })),
    storedCatalogs,
    storedCourses: storedCourses.map(row => ({
      slug: row.slug, status: row.status, catalogSlug: row.catalog?.slug ?? null,
    })),
    overrides,
  });

  const items: LearningVisibilityItem[] = [
    ...Object.values(catalogMap).map(item => ({
      kind: "catalog" as const,
      slug: item.slug,
      title: item.title,
      status: item.status,
      hidden: isDiscoveryHidden(catalogBySlug.get(item.slug)?.meta),
      seeded: catalogBySlug.has(item.slug),
    })),
    ...Object.values(courseMap).map(item => ({
      kind: "course" as const,
      slug: item.slug,
      title: item.title,
      status: item.status,
      hidden: isDiscoveryHidden(courseBySlug.get(item.slug)?.meta),
      seeded: courseBySlug.has(item.slug),
    })),
  ];
  const response: LearningVisibilityAdminResponse = { items, audit };
  return appCorsJson(req, response);
}

/** The server, not the Admin SPA, checks capability, origin and allowed slugs. */
export async function PATCH(req: Request) {
  if (!isAppMutationOriginAllowed(req)) {
    return appCorsJson(req, { error: "Invalid request origin" }, { status: 403 });
  }
  const denied = await requireAdmin(req);
  if (denied) return applyAppCorsHeaders(req, denied);
  let json: unknown;
  try { json = await req.json(); }
  catch { return appCorsJson(req, { error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return appCorsJson(req, { error: "Invalid visibility change" }, { status: 400 });
  }
  const { kind, slug, hidden } = parsed.data;
  const valid = kind === "catalog"
    ? Boolean((await getResolvedCatalogMap())[slug])
    : Boolean((await getResolvedSubjectCardMap())[slug]);
  if (!valid) return appCorsJson(req, { error: "Catalog or course not found" }, { status: 404 });
  const saved = await setHiddenDiscovery(kind, slug, hidden);
  if (!saved) return appCorsJson(req, { error: "Catalog or course is not seeded, or contains invalid metadata" }, { status: 409 });
  const response: LearningVisibilityChangeResponse = { ok: true, visibility: { kind, slug, hidden } };
  return appCorsJson(req, response);
}
