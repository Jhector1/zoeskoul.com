import {
  adminCurriculumDraftOptions,
  runAdminCurriculumDraftRoute,
} from "@/lib/admin/curriculumDraftRoute";
import { readOnlyDerivedArtifactResponse } from "@/lib/dev/curriculumDrafts/readOnlyDerived";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PUT(request: Request) {
  return runAdminCurriculumDraftRoute(
    request,
    async () => readOnlyDerivedArtifactResponse(),
  );
}

export function OPTIONS(request: Request) {
  return adminCurriculumDraftOptions(request);
}
