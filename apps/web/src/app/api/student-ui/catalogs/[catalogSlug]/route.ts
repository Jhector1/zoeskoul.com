import {
  appCorsJson,
  appCorsPreflight,
} from "@/lib/http/appCors";
import {
  getAvailableVisibleCatalogForActor,
} from "@/lib/subjects/server/catalogVisibility";
import {
  withResolvedCatalogImage,
} from "@/lib/subjects/catalogImagePresentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ catalogSlug: string }>;
  },
) {
  try {
    const { catalogSlug } = await context.params;
    const catalog =
      await getAvailableVisibleCatalogForActor(
        catalogSlug,
      );

    if (!catalog) {
      return appCorsJson(
        request,
        { error: "Catalog not found." },
        { status: 404 },
      );
    }

    return appCorsJson(request, {
      catalog: withResolvedCatalogImage(catalog),
    });
  } catch (error) {
    console.error("[student UI catalog]", error);

    return appCorsJson(
      request,
      { error: "Catalog could not be loaded." },
      { status: 500 },
    );
  }
}
