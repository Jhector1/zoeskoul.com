import type { Request, RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { sharedFullStackPreviews } from "../services/build/sharedPreviewRegistry.js";
import {
  allowedDevelopmentHmrOrigin, developmentHmrTickets,
  validDevelopmentHmrIdentity,
  type DevelopmentHmrIdentity,
} from "../services/build/tanstackDevelopmentHmrTickets.js";

type TicketDependencies = Readonly<{
  enabled: () => boolean;
  actorKey: (req: Request) => string;
  assertLease: (identity: DevelopmentHmrIdentity) => void;
  issue: (identity: DevelopmentHmrIdentity, origin: string) => string;
  allowedOrigins: () => string[];
}>;

const productionDeps: TicketDependencies = {
  enabled: () => process.env.RUNNER_EXECUTION_POOL === "zoebuild" &&
    process.env.ZOEBUILD_DEVELOPMENT_HMR_GATEWAY_ENABLED === "true",
  actorKey: getRequiredActorKey,
  assertLease: (identity: DevelopmentHmrIdentity) =>
    sharedFullStackPreviews.assertDevelopmentReadOpen(identity),
  issue: (identity: DevelopmentHmrIdentity, origin: string) =>
    developmentHmrTickets.issue(identity, origin),
  allowedOrigins: () => [
    ...(process.env.ALLOWED_WEB_ORIGINS ?? "").split(","),
    process.env.WEB_URL ?? "",
  ].map(item => item.trim()).filter(Boolean),
};

/** This route MUST be mounted behind global requireServiceAuth in app.ts.
 * Browser clients cannot call it. The ZoeBuild server must separately
 * authenticate the user's session and revalidate project ownership before
 * asking the Runner to mint a ticket. */
export function makeTanstackDevelopmentHmrTicketRoute(
  deps: TicketDependencies = productionDeps,
): RequestHandler {
  return (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ ok: false, code: "NOT_FOUND" });
    try {
      const body: unknown = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw Error("Invalid request");
      const values = body as Record<string, unknown>;
      if (Object.keys(values).sort().join(",") !== "buildProjectId,origin,sourceVersion")
        throw Error("Invalid request");
      const actorKey = deps.actorKey(req as Request);
      const identity: DevelopmentHmrIdentity = {
        ownerKey: actorKey, previewId: String(req.params.previewId ?? ""),
        buildProjectId: values.buildProjectId as string,
        sourceVersion: values.sourceVersion as number,
      };
      if (!validDevelopmentHmrIdentity(identity) ||
          !allowedDevelopmentHmrOrigin(values.origin, deps.allowedOrigins()))
        throw Error("Invalid request");
      deps.assertLease(identity);
      const ticket = deps.issue(identity, values.origin);
      // Never expose internal Docker, Vite, or preview capability paths.
      return res.status(200).set("Cache-Control", "no-store").json({
        ok: true, ticket, expiresInMs: 20_000,
        wsPath: `/build/previews/${encodeURIComponent(identity.previewId)}/development-hmr/ws`,
      });
    } catch {
      return res.status(404).json({ ok: false, code: "NOT_FOUND" });
    }
  };
}
export const issueTanstackDevelopmentHmrTicketRoute = makeTanstackDevelopmentHmrTicketRoute();
