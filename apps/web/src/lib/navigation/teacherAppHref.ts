import {
  buildLocalizedAppUrl,
  resolveAppOrigin,
  type ZoeSkoulDeploymentEnvironment,
} from "@zoeskoul/app-config";

type ResolveTeacherAppHrefArgs = {
  locale: string;
  pathname: string;
  configuredOrigin?: string | null;
  deploymentEnvironment?: ZoeSkoulDeploymentEnvironment;
};

function currentDeploymentEnvironment(): ZoeSkoulDeploymentEnvironment {
  if (process.env.VERCEL_ENV === "preview") {
    return "preview";
  }

  if (process.env.VERCEL_ENV === "production") {
    return "production";
  }

  if (process.env.NODE_ENV === "development") {
    return "development";
  }

  if (process.env.NODE_ENV === "test") {
    return "test";
  }

  return "production";
}

/**
 * Builds a locale-preserving handoff into the Teacher browser app by
 * composing the existing shared app-origin and URL builders.
 *
 * Preview intentionally returns null when no Teacher preview origin is
 * configured, preserving the legacy Web teaching surface instead of
 * silently escaping a preview session into production.
 */
export function resolveTeacherAppHref(
  args: ResolveTeacherAppHrefArgs,
): string | null {
  const configuredOrigin =
    Object.prototype.hasOwnProperty.call(args, "configuredOrigin")
      ? args.configuredOrigin
      : process.env.NEXT_PUBLIC_TEACHER_APP_ORIGIN;

  const origin = resolveAppOrigin({
    appId: "teacher",
    configuredOrigin,
    deploymentEnvironment:
      args.deploymentEnvironment ?? currentDeploymentEnvironment(),
  });

  if (!origin) {
    return null;
  }

  return buildLocalizedAppUrl({
    origin,
    pathname: args.pathname,
    locale: args.locale,
  });
}
