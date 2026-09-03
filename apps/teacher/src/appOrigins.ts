import {
  getProductionAppOrigin,
  resolveAppOrigin,
  type ZoeSkoulDeploymentEnvironment,
} from "@zoeskoul/app-config";

function deploymentEnvironment(
  currentOrigin: string,
): ZoeSkoulDeploymentEnvironment {
  const hostname = new URL(currentOrigin).hostname;

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  ) {
    return "development";
  }

  if (currentOrigin === getProductionAppOrigin("teacher")) {
    return "production";
  }

  return "preview";
}

export function resolveTeacherAppOrigins() {
  const currentOrigin =
    typeof window === "undefined"
      ? getProductionAppOrigin("teacher")
      : window.location.origin;

  const environment =
    deploymentEnvironment(currentOrigin);

  const websiteOrigin =
    resolveAppOrigin({
      appId: "website",
      configuredOrigin: import.meta.env.VITE_WEBSITE_ORIGIN,
      currentOrigin,
      deploymentEnvironment: environment,
    }) ?? currentOrigin;

  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ??
    (
      environment === "development"
        ? currentOrigin
        : websiteOrigin
    );

  return {
    apiOrigin,
    websiteOrigin,
  };
}
