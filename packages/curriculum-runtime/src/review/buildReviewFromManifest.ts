import { makeTopicDef } from "@zoeskoul/curriculum-core";
import { tag } from "../i18n/resolveManifestMessages.js";
import { buildReviewFromManifestCore } from "./buildReviewFromManifestCore.js";

export function buildReviewFromManifest(args: {
  manifest: any;
  pool: readonly { key: string; w: number; kind?: any; purpose?: any }[];
}) {
  return buildReviewFromManifestCore({
    manifest: args.manifest,
    pool: args.pool,
    tag,
    makeTopicDef,
  });
}