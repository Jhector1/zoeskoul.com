import {
  getProductionAppOrigin,
} from "@zoeskoul/app-config";

export function resolveLogoutWebsiteOrigin(args: {
  requestOrigin: string;
  nodeEnv?: string;
  vercelEnv?: string;
}): string {
  const productionRuntime =
    args.nodeEnv === "production";
  const previewDeployment =
    args.vercelEnv === "preview";

  return productionRuntime && !previewDeployment
    ? getProductionAppOrigin("website")
    : args.requestOrigin;
}
