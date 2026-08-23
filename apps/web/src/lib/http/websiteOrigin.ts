import { getProductionAppOrigin } from "@zoeskoul/app-config";

export function resolveWebsiteOriginForRuntime(args: {
  requestOrigin: string;
  nodeEnv?: string;
  vercelEnv?: string;
}): string {
  const requestOrigin = new URL(args.requestOrigin).origin;
  const productionRuntime = args.nodeEnv === "production";
  const previewDeployment = args.vercelEnv === "preview";

  return productionRuntime && !previewDeployment
    ? getProductionAppOrigin("website")
    : requestOrigin;
}

export function resolveRequestWebsiteOrigin(request: Request): string {
  return resolveWebsiteOriginForRuntime({
    requestOrigin: new URL(request.url).origin,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
}
