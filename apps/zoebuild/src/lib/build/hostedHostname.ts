import "server-only";

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@zoeskoul/db";
import { productionHostedSelection } from "./hostedProductionPolicy";

// PUB3A3 is a development-only reservation foundation. This namespace is
// intentionally non-public; no DNS, published URL or routing is implied.
export const HOSTED_DEV_DOMAIN = "sites.zoebuild.test";
const RESERVED = new Set([
  "www", "api", "admin", "auth", "app", "build", "zoebuild", "zoeskoul",
  "assets", "cdn", "static", "media", "mail", "smtp", "imap", "pop",
  "ftp", "ns", "ns1", "ns2", "dns", "localhost", "status", "support",
  "billing", "dashboard", "login", "account", "accounts", "docs", "help",
  "preview", "publish", "deploy", "gateway", "runner", "internal", "test",
  "dev", "staging", "production", "root", "host", "sites", "site",
]);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class HostedHostnameError extends Error {
  constructor(readonly code: "DISABLED" | "NOT_FOUND" | "INVALID_RESERVATION" | "ALLOCATION_BUSY") {
    super(code);
    this.name = "HostedHostnameError";
  }
}

/** A title is a suggestion, never a hostname or authority. */
export function hostedTitleLabel(title: string): string | null {
  if (/^\s*xn--/i.test(title)) return null;
  const label = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 48).replace(/-+$/g, "");
  return LABEL.test(label) && !RESERVED.has(label) && !label.startsWith("site-")
    && !label.startsWith("xn--") && !/^ns\d+$/.test(label) ? label : null;
}

export function isValidReservation(hostname: string): boolean {
  const suffix = `.${HOSTED_DEV_DOMAIN}`;
  if (!hostname.endsWith(suffix)) return false;
  const label = hostname.slice(0, -suffix.length);
  return /^site-[a-f0-9]{24}$/.test(label) || hostedTitleLabel(label) === label;
}

export function hostedHostnamePolicyEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.VERCEL_ENV !== "production"
    && process.env.ZOEBUILD_PUBLISH_ENABLED === "0"
    && process.env.ZOEBUILD_HOSTED_HOSTNAMES_ENABLED === "1";
}

function retryable(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error.code === "P2002" || error.code === "P2034");
}

/**
 * Call only with the authenticated server-side owner id, never a client-supplied
 * owner id. The database uniqueness constraints arbitrate concurrent allocations.
 * Reservations are not deployments and must never be treated as proof of hosting.
 * No API, public lookup, activation or release mutation is exposed by this module.
 */
export async function reserveHostedHostname(client: PrismaClient, input: Readonly<{
  ownerId: string; buildProjectId: string;
}>): Promise<string> {
  const production=productionHostedSelection(input.buildProjectId,process.env);
  if (!hostedHostnamePolicyEnabled() && production?.ownerId!==input.ownerId) {
    throw new HostedHostnameError("DISABLED");
  }
  if (!input.ownerId || !input.buildProjectId) throw new HostedHostnameError("NOT_FOUND");
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await client.$transaction(async tx => {
        const project = await tx.buildProject.findFirst({
          where: { id: input.buildProjectId, status: { not: "archived" },
            stackId: "tanstack-start-v1", codeProject: { ownerId: input.ownerId, archivedAt: null } },
          select: { id: true, codeProject: { select: { title: true } } },
        });
        if (!project) throw new HostedHostnameError("NOT_FOUND");
        const existing = await tx.buildHostedHostname.findUnique({
          where: { buildProjectId: project.id }, select: { hostname: true },
        });
        if (existing) {
          if (!isValidReservation(existing.hostname)) throw new HostedHostnameError("INVALID_RESERVATION");
          return existing.hostname;
        }
        const preferred = attempt === 0 ? hostedTitleLabel(project.codeProject.title) : null;
        const label = preferred ?? `site-${randomBytes(12).toString("hex")}`;
        const hostname = `${label}.${HOSTED_DEV_DOMAIN}`;
        const reserved = await tx.buildHostedHostname.create({
          data: { hostname, buildProjectId: project.id }, select: { hostname: true },
        });
        return reserved.hostname;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!retryable(error)) throw error;
      // Retry in a fresh transaction. Another request may already have won the
      // project reservation, or another project may own the preferred label.
    }
  }
  throw new HostedHostnameError("ALLOCATION_BUSY");
}
