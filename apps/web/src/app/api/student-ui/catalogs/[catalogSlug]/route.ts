import {
  getAvailableVisibleCatalogForActor,
} from "@/lib/subjects/server/catalogVisibility";

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
      return Response.json(
        { error: "Catalog not found." },
        {
          status: 404,
          headers: corsHeaders(request),
        },
      );
    }

    return Response.json(
      { catalog },
      { headers: corsHeaders(request) },
    );
  } catch (error) {
    console.error("[student UI catalog]", error);

    return Response.json(
      { error: "Catalog could not be loaded." },
      {
        status: 500,
        headers: corsHeaders(request),
      },
    );
  }
}
