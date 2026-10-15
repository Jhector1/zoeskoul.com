import {
  resolveAppOrigin,
  type ZoeSkoulDeploymentEnvironment,
} from "@zoeskoul/app-config";

function deploymentEnvironment(): ZoeSkoulDeploymentEnvironment {
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.NODE_ENV === "development") return "development";

  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "production") return "production";

  return process.env.NODE_ENV === "production"
    ? "production"
    : "development";
}

function configured(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function resolveZoeBuildOrigins() {
  const environment = deploymentEnvironment();

  const websiteOrigin = resolveAppOrigin({
    appId: "website",
    configuredOrigin:
      configured("NEXT_PUBLIC_WEBSITE_ORIGIN") ??
      configured("WEBSITE_ORIGIN"),
    deploymentEnvironment: environment,
  });

  const zoebuildOrigin = resolveAppOrigin({
    appId: "zoebuild",
    configuredOrigin:
      configured("NEXT_PUBLIC_ZOEBUILD_ORIGIN") ??
      configured("ZOEBUILD_ORIGIN"),
    deploymentEnvironment: environment,
  });

  if (!websiteOrigin || !zoebuildOrigin) {
    throw new Error(
      "ZoeBuild application origins are not configured for this deployment.",
    );
  }

  return { websiteOrigin, zoebuildOrigin };
}
