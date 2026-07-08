import "server-only";

import crypto from "node:crypto";

import {
  buildCloudinaryImageUrl,
  type CloudinaryImageOpts,
} from "./url";

const MAX_CHALLENGE_OG_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_CHALLENGE_OG_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type UploadedCloudinaryImage = {
  publicId: string;
  secureUrl: string;
  width: number | null;
  height: number | null;
  format: string | null;
  bytes: number | null;
};

type CloudinaryCredentialSource = "explicit" | "cloudinary-url";

type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  source: CloudinaryCredentialSource;
};

const CLOUDINARY_SIGNATURE_ALGORITHM = "sha256";

type CloudinaryUploadResponse = {
  public_id?: unknown;
  secure_url?: unknown;
  width?: unknown;
  height?: unknown;
  format?: unknown;
  bytes?: unknown;
  error?: { message?: unknown };
};

function readEnvValue(name: string) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return "";

  const first = raw[0];
  const last = raw[raw.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return raw.slice(1, -1).trim();
  }

  return raw;
}

function readCloudinaryUrl(): CloudinaryConfig | null {
  const raw = readEnvValue("CLOUDINARY_URL");
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "CLOUDINARY_URL is invalid. Copy the complete cloudinary://API_KEY:API_SECRET@CLOUD_NAME value from Cloudinary.",
    );
  }

  if (url.protocol !== "cloudinary:") {
    throw new Error("CLOUDINARY_URL must start with cloudinary://.");
  }

  const cloudName = decodeURIComponent(url.hostname).trim();
  const apiKey = decodeURIComponent(url.username).trim();
  const apiSecret = decodeURIComponent(url.password).trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "CLOUDINARY_URL must contain the cloud name, API key, and API secret.",
    );
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    source: "cloudinary-url",
  };
}

function readExplicitCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = readEnvValue("CLOUDINARY_CLOUD_NAME");
  const apiKey = readEnvValue("CLOUDINARY_API_KEY");
  const apiSecret = readEnvValue("CLOUDINARY_API_SECRET");
  const provided = [cloudName, apiKey, apiSecret].filter(Boolean).length;

  if (provided === 0) return null;

  const missing = [
    !cloudName ? "CLOUDINARY_CLOUD_NAME" : null,
    !apiKey ? "CLOUDINARY_API_KEY" : null,
    !apiSecret ? "CLOUDINARY_API_SECRET" : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new Error(
      `Cloudinary server credentials are incomplete. Missing: ${missing.join(", ")}.`,
    );
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    source: "explicit",
  };
}

function sameCloudinaryCredentials(left: CloudinaryConfig, right: CloudinaryConfig) {
  return (
    left.cloudName === right.cloudName &&
    left.apiKey === right.apiKey &&
    left.apiSecret === right.apiSecret
  );
}

function getCloudinaryConfig(): CloudinaryConfig {
  const explicit = readExplicitCloudinaryConfig();
  const fromUrl = readCloudinaryUrl();

  if (explicit && fromUrl && !sameCloudinaryCredentials(explicit, fromUrl)) {
    throw new Error(
      "Conflicting Cloudinary credentials are configured. Use either CLOUDINARY_URL or the complete CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET set, or make both sources identical.",
    );
  }

  const config = explicit ?? fromUrl;
  if (!config) {
    throw new Error(
      "Cloudinary uploads are not configured. Set CLOUDINARY_URL or the complete CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET set.",
    );
  }

  return config;
}

export function signCloudinaryParams(
  params: Record<string, string | number | boolean>,
  apiSecret: string,
) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");

  return crypto
    .createHash(CLOUDINARY_SIGNATURE_ALGORITHM)
    .update(`${payload}${apiSecret}`, "utf8")
    .digest("hex");
}

function safeCloudinaryConfigLabel(config: CloudinaryConfig) {
  const apiKeySuffix = config.apiKey.slice(-4).padStart(4, "*");
  return `source=${config.source}, cloud=${config.cloudName}, apiKeySuffix=${apiKeySuffix}, signature=${CLOUDINARY_SIGNATURE_ALGORITHM}`;
}

function hasJpegSignature(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasPngSignature(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function hasWebpSignature(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

export function validateChallengeOgImageFile(file: File) {
  if (!ALLOWED_CHALLENGE_OG_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }

  if (file.size <= 0) {
    throw new Error("The selected image is empty.");
  }

  if (file.size > MAX_CHALLENGE_OG_IMAGE_BYTES) {
    throw new Error("The preview image must be 4 MB or smaller.");
  }
}

async function validateChallengeOgImageSignature(file: File) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const valid =
    (file.type === "image/jpeg" && hasJpegSignature(header)) ||
    (file.type === "image/png" && hasPngSignature(header)) ||
    (file.type === "image/webp" && hasWebpSignature(header));

  if (!valid) {
    throw new Error("The uploaded file does not match its declared image type.");
  }
}

export function cloudinaryServerImageUrl(
  publicId: string,
  opts: CloudinaryImageOpts = {},
) {
  return buildCloudinaryImageUrl(
    getCloudinaryConfig().cloudName,
    publicId,
    opts,
  );
}

export async function uploadChallengeOgImage(file: File): Promise<UploadedCloudinaryImage> {
  validateChallengeOgImageFile(file);
  await validateChallengeOgImageSignature(file);

  const config = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    folder: "zoeskoul/challenges/og",
    overwrite: false,
    timestamp,
    unique_filename: true,
    use_filename: false,
  };
  const signature = signCloudinaryParams(params, config.apiSecret);
  const form = new FormData();

  form.set("file", file, file.name || "challenge-preview");
  form.set("api_key", config.apiKey);
  form.set("signature", signature);
  for (const [key, value] of Object.entries(params)) {
    form.set(key, String(value));
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
    {
      method: "POST",
      body: form,
      cache: "no-store",
    },
  );
  const body = (await response.json().catch(() => null)) as CloudinaryUploadResponse | null;

  if (!response.ok || !body || typeof body.public_id !== "string") {
    const message = body?.error?.message;
    const configLabel = safeCloudinaryConfigLabel(config);
    throw new Error(
      typeof message === "string" && message.trim()
        ? `Cloudinary upload failed: ${message} (${configLabel})`
        : `Cloudinary upload failed. (${configLabel})`,
    );
  }

  return {
    publicId: body.public_id,
    secureUrl: typeof body.secure_url === "string" ? body.secure_url : "",
    width: typeof body.width === "number" ? body.width : null,
    height: typeof body.height === "number" ? body.height : null,
    format: typeof body.format === "string" ? body.format : null,
    bytes: typeof body.bytes === "number" ? body.bytes : null,
  };
}

export async function destroyCloudinaryImage(publicId: string) {
  if (!publicId.trim()) return;

  const config = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    invalidate: true,
    public_id: publicId,
    timestamp,
  };
  const signature = signCloudinaryParams(params, config.apiSecret);
  const form = new FormData();

  form.set("api_key", config.apiKey);
  form.set("signature", signature);
  for (const [key, value] of Object.entries(params)) {
    form.set(key, String(value));
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`,
    {
      method: "POST",
      body: form,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    console.error("[challenge-og-image] Cloudinary cleanup failed", {
      publicId,
      status: response.status,
    });
  }
}
