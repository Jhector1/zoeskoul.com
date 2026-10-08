import {
  appCorsJson,
  appCorsPreflight,
} from "@/lib/http/appCors";
import {
  getAvailableVisibleCatalogsForActor,
} from "@/lib/subjects/server/catalogVisibility";
import {
  withResolvedCatalogImage,
} from "@/lib/subjects/catalogImagePresentation";
import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import { getLearnerCatalogDepartmentFilter } from "@/lib/onboarding/departmentSelection";
import { resolveDepartmentPresentation } from "@zoeskoul/curriculum-registry/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}

export async function GET(request: Request) {
  try {
    const access = await getCurrentUserAccess();
    const catalogs =
      await getAvailableVisibleCatalogsForActor(
        access.user
          ? { userId: access.user.id, email: access.user.email }
          : undefined,
      );

    const departmentFilter =
      access.user && !catalogs.some((catalog) => catalog.actorAccess.canSeeAllCatalogSubjects)
        ? await getLearnerCatalogDepartmentFilter(access.user.id)
        : null;

    const personalizedCatalogs = departmentFilter
      ? catalogs.filter((catalog) =>
          departmentFilter.has(
            resolveDepartmentPresentation({
              catalogFamily: catalog.family,
              catalogSlug: catalog.slug,
            }).id,
          ),
        )
      : catalogs;

    return appCorsJson(request, {
      catalogs: personalizedCatalogs.map(withResolvedCatalogImage),
    });
  } catch (error) {
    console.error("[student UI catalogs]", error);

    return appCorsJson(
      request,
      { error: "Catalogs could not be loaded." },
      { status: 500 },
    );
  }
}
