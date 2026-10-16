import { Buffer } from "node:buffer";

import type {
  BuildPromptMedia,
} from "@zoeskoul/build-ai";

export const BUILD_AI_UPLOAD_LIMITS = {
  maxFiles: 4,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 12 * 1024 * 1024,
} as const;

export class BuildPlanRequestError extends Error {
  constructor(
    readonly code:
      | "BUILD_AI_REQUEST_INVALID"
      | "BUILD_AI_MEDIA_UNSUPPORTED"
      | "BUILD_AI_MEDIA_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "BuildPlanRequestError";
  }
}

function mediaKind(
  mimeType: string,
): BuildPromptMedia["kind"] | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

export async function parseBuildPlanFormData(
  form: FormData,
): Promise<{
  prompt: string;
  media: readonly BuildPromptMedia[];
}> {
  const promptValue = form.get("prompt");

  if (
    promptValue !== null &&
    typeof promptValue !== "string"
  ) {
    throw new BuildPlanRequestError(
      "BUILD_AI_REQUEST_INVALID",
      "Prompt text is invalid.",
    );
  }

  const prompt =
    typeof promptValue === "string" ? promptValue : "";
  const entries = form.getAll("media");

  if (entries.length > BUILD_AI_UPLOAD_LIMITS.maxFiles) {
    throw new BuildPlanRequestError(
      "BUILD_AI_MEDIA_TOO_LARGE",
      `Add at most ${BUILD_AI_UPLOAD_LIMITS.maxFiles} media files per request.`,
    );
  }

  const files: File[] = [];

  for (const entry of entries) {
    if (!(entry instanceof File)) {
      throw new BuildPlanRequestError(
        "BUILD_AI_REQUEST_INVALID",
        "Media entries must be uploaded files.",
      );
    }
    files.push(entry);
  }

  const totalBytes = files.reduce(
    (total, file) => total + file.size,
    0,
  );

  if (totalBytes > BUILD_AI_UPLOAD_LIMITS.maxTotalBytes) {
    throw new BuildPlanRequestError(
      "BUILD_AI_MEDIA_TOO_LARGE",
      "Image, video, and audio uploads may total at most 12 MB per request.",
    );
  }

  const media: BuildPromptMedia[] = [];

  for (const file of files) {
    if (
      file.size <= 0 ||
      file.size > BUILD_AI_UPLOAD_LIMITS.maxFileBytes
    ) {
      throw new BuildPlanRequestError(
        "BUILD_AI_MEDIA_TOO_LARGE",
        "Each uploaded media file must be non-empty and no larger than 10 MB.",
      );
    }

    const kind = mediaKind(file.type);

    if (!kind) {
      throw new BuildPlanRequestError(
        "BUILD_AI_MEDIA_UNSUPPORTED",
        "Only image, video, and audio uploads are supported.",
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    media.push({
      kind,
      mimeType: file.type,
      name: file.name.trim().slice(0, 200) || undefined,
      source: {
        type: "base64",
        data: bytes.toString("base64"),
      },
    });
  }

  return { prompt, media };
}
