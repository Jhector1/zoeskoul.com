import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/**
 * A provenance-branded address. Only an upstream ingress which holds the
 * signing key may assert it. Never parse x-real-ip/x-forwarded-for or JSON
 * command payloads to populate this value.
 *
 * Ingress contract: strip all three client-supplied headers, then set:
 *  x-zoebuild-buyer-ip, x-zoebuild-buyer-ip-timestamp (Unix seconds),
 *  x-zoebuild-buyer-ip-signature (64 lowercase HMAC-SHA256 hex chars).
 * Signature payload: v1\nMETHOD\nPATHNAME\nTIMESTAMP\nIP
 * This module does not configure/enable that ingress itself.
 */
declare const verifiedBuyerIpBrand: unique symbol;
export type VerifiedCommerceBuyerIp = string & {
  readonly [verifiedBuyerIpBrand]: true;
};

const WINDOW_SECONDS = 60;
const IP_HEADER = "x-zoebuild-buyer-ip";
const TS_HEADER = "x-zoebuild-buyer-ip-timestamp";
const SIG_HEADER = "x-zoebuild-buyer-ip-signature";

export function trustedCommerceBuyerIpFromRequest(
  request: Request,
  options: Readonly<{ signingKey?: string; nowMs?: number }> = {},
): VerifiedCommerceBuyerIp | null {
  const key = options.signingKey ?? process.env.ZOEBUILD_BUYER_IP_SIGNING_KEY;
  // Short or missing secrets cannot establish trusted client identity.
  if (!key || Buffer.byteLength(key, "utf8") < 32) return null;
  const ip = request.headers.get(IP_HEADER);
  const ts = request.headers.get(TS_HEADER);
  const signature = request.headers.get(SIG_HEADER);
  if (!ip || !ts || !signature || ip !== ip.trim() || isIP(ip) === 0 ||
      !/^[0-9]{10,11}$/.test(ts) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const seconds = Number(ts);
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isSafeInteger(seconds) || !Number.isFinite(nowMs) ||
      Math.abs(Math.floor(nowMs / 1000) - seconds) > WINDOW_SECONDS) return null;
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return null;
  }
  const payload = `v1\n${request.method.toUpperCase()}\n${pathname}\n${ts}\n${ip}`;
  const actual = createHmac("sha256", key).update(payload, "utf8").digest();
  const supplied = Buffer.from(signature, "hex");
  if (actual.length !== supplied.length || !timingSafeEqual(actual, supplied)) return null;
  return ip as VerifiedCommerceBuyerIp;
}
