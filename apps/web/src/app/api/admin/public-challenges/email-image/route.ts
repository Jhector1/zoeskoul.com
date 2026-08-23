import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  cloudinaryServerImageUrl,
  uploadChallengeOgImage,
} from "@/lib/cloudinary/server";
import { resolveChallengePublisherAccess } from "@/lib/practice/challenges/publisherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden." }, { status: 403 });
  }

  const access = await resolveChallengePublisherAccess();
  if (!access.authenticated) {
    return appCorsJson(request, { error: "Unauthorized." }, { status: 401 });
  }
  if (!access.allowed) {
    return appCorsJson(
      request,
      { error: "Publisher access required." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return appCorsJson(
      request,
      { error: "Invalid image upload request." },
      { status: 400 },
    );
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size <= 0) {
    return appCorsJson(
      request,
      { error: "Choose a challenge preview image." },
      { status: 400 },
    );
  }

  try {
    const uploaded = await uploadChallengeOgImage(image);
    const imageUrl = cloudinaryServerImageUrl(uploaded.publicId, {
      w: 1200,
      h: 630,
      crop: "fill",
      gravity: "auto",
      quality: "auto",
      format: "jpg",
    });

    return appCorsJson(request, {
      ok: true,
      imageUrl,
    });
  } catch (error) {
    console.error("[public-challenge-email-image] upload failed", error);
    return appCorsJson(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not upload the challenge preview image.",
      },
      { status: 400 },
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
