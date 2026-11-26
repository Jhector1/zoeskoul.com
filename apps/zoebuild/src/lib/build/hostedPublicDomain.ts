import "server-only";
import { HOSTED_DEV_DOMAIN, isValidReservation } from "./hostedHostname";

// Explicit V1 support for ordinary, single-label public suffixes only.
// This is not a Public Suffix List implementation. Other suffixes require review.
const SUPPORTED_SUFFIXES = new Set(["com", "net", "org", "site", "app", "dev"]);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONFIG_ERROR = "INVALID_HOSTED_PUBLIC_DOMAIN";

function checkedOrigin(origin: string): string {
  // Validate the original string as well as the parsed URL, so URL normalization
  // cannot silently accept a port, credentials, trailing dot or encoded host.
  const match = /^https:\/\/([a-z0-9.-]+)\/?$/.exec(origin);
  if (!match || match[0] !== origin) throw new Error(CONFIG_ERROR);
  const host = match[1];
  const labels = host.split(".");
  if (host.length > 253 || labels.length < 2 || labels.some(label =>
    !LABEL.test(label) || label.startsWith("xn--")) ||
    !SUPPORTED_SUFFIXES.has(labels[labels.length - 1])) throw new Error(CONFIG_ERROR);
  return host;
}

/** Configuration only. This does not verify DNS ownership, activate a site,
 * authorize a request, or make a deployment public. No environment fallback.
 * The server must supply both origins from trusted operator configuration.
 */
export function createHostedPublicDomain(publicOrigin: string, controlOrigin: string) {
  const domain = checkedOrigin(publicOrigin);
  const control = checkedOrigin(controlOrigin);
  if (domain.split(".").length !== 2 || domain === control.split(".").slice(-2).join(".")) {
    throw new Error(CONFIG_ERROR);
  }
  const canonicalSuffix = `.${HOSTED_DEV_DOMAIN}`;
  const publicSuffix = `.${domain}`;
  return Object.freeze({
    domain,
    publicHostname(reservation: string): string {
      if (!isValidReservation(reservation)) throw new Error("INVALID_HOSTED_RESERVATION");
      return reservation.slice(0, -canonicalSuffix.length) + publicSuffix;
    },
    canonicalHostname(host: string): string | null {
      // Only exact lower-case DNS names, not arbitrary Host header values.
      if (!host.endsWith(publicSuffix)) return null;
      const canonical = host.slice(0, -publicSuffix.length) + canonicalSuffix;
      return isValidReservation(canonical) ? canonical : null;
    },
  });
}
