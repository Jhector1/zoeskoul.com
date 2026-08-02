import {
  getAvailableVisibleCatalogsForActor,
} from "@/lib/subjects/server/catalogVisibility";
import { withResolvedCatalogImage } from "@/lib/subjects/catalogImagePresentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const configured = [
    process.env.STUDENT_APP_ORIGIN,
    process.env.NEXT_PUBLIC_STUDENT_APP_ORIGIN,
    "https://student.zoeskoul.com",
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:3002"]
      : []),
  ].filter(Boolean);
  const allowed = Boolean(
    origin && configured.includes(origin),
  );

  return {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    ...(allowed
      ? { "Access-Control-Allow-Origin": origin! }
      : {}),
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export async function GET(request: Request) {
  try {
    const catalogs =
      await getAvailableVisibleCatalogsForActor();

    return Response.json(
      { catalogs: catalogs.map(withResolvedCatalogImage) },
      { headers: corsHeaders(request) },
    );
  } catch (error) {
    console.error("[student UI catalogs]", error);

    return Response.json(
      { error: "Catalogs could not be loaded." },
      {
        status: 500,
        headers: corsHeaders(request),
      },
    );
  }
}
