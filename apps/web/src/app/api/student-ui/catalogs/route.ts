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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}

export async function GET(request: Request) {
  try {
    const catalogs =
      await getAvailableVisibleCatalogsForActor();

    return appCorsJson(request, {
      catalogs: catalogs.map(withResolvedCatalogImage),
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
