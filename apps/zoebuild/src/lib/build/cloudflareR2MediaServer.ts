/** Server-only Cloudflare R2 binding for AI4B2. No client code imports this. */
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createCloudflareR2PrivateObjectStore,
  type BuildMediaPrivateObjectStore,
} from "@zoeskoul/build-application";

const FILE_NAME = "zoebuild-media-r2.json";

/** Trusted media service only: never invoked by generated code or an unauthenticated route. */
export function createZoeBuildPrivateR2ObjectStore(): BuildMediaPrivateObjectStore {
  const path = join(homedir(), ".zoeskoul", "secrets", FILE_NAME);
  // O_NOFOLLOW + fstat eliminate a symlink swap between path and read.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let raw: string;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 ||
        (typeof process.getuid === "function" && stat.uid !== process.getuid())) {
      throw new Error("BUILD_MEDIA_R2_SECRET_FILE_UNSAFE");
    }
    if (stat.size > 4096) throw new Error("BUILD_MEDIA_R2_SECRET_FILE_UNSAFE");
    raw = readFileSync(fd, {encoding: "utf8"});
  } finally { closeSync(fd); }
  if (raw.length > 4096) throw new Error("BUILD_MEDIA_R2_SECRET_FILE_UNSAFE");
  let config: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("invalid");
    config = parsed as Record<string, unknown>;
  } catch { throw new Error("BUILD_MEDIA_R2_SECRET_FILE_INVALID"); }
  const names = ["accountId", "bucket", "accessKeyId", "secretAccessKey"];
  if (Object.keys(config).sort().join(",") !== names.sort().join(",")) {
    throw new Error("BUILD_MEDIA_R2_SECRET_FILE_INVALID");
  }
  return createCloudflareR2PrivateObjectStore({
    accountId: String(config.accountId),
    bucket: String(config.bucket),
    accessKeyId: String(config.accessKeyId),
    secretAccessKey: String(config.secretAccessKey),
  });
}
