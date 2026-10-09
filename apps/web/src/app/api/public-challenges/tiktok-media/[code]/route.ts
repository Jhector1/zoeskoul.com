import { cloudinaryServerImageUrl } from "@/lib/cloudinary/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const challenge = await prisma.practiceChallengeLink.findUnique({
    where: { code },
    select: {
      tiktokImagePublicId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  const now = new Date();
  if (
    !challenge?.tiktokImagePublicId ||
    challenge.revokedAt ||
    (challenge.expiresAt && challenge.expiresAt <= now)
  ) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamUrl = cloudinaryServerImageUrl(
    challenge.tiktokImagePublicId,
    {
      w: 1200,
      h: 630,
      crop: "fill",
      gravity: "auto",
      quality: "auto",
      format: "jpg",
    },
  );
  const upstream = await fetch(upstreamUrl, { cache: "force-cache" });

  if (!upstream.ok || !upstream.body) {
    return new Response("Image unavailable", { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      "Cache-Control":
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
