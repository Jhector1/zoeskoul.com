import {
  buildLocalizedAppUrl,
  getProductionAppOrigin,
  normalizeConfiguredAppOrigin,
  resolveAppOrigin,
  type ZoeSkoulDeploymentEnvironment,
} from "@zoeskoul/app-config";

export type ZoeSkoulRuntimeEnvironment =
  ZoeSkoulDeploymentEnvironment;

export type StudentAppOriginOptions = {
  environment?: ZoeSkoulRuntimeEnvironment;
  configuredOrigin?: string | null;
  currentOrigin?: string | null;
};

function runtimeUrlOrigin(
  value: string | null | undefined,
): string | null {
  const candidate = value?.trim();

  if (!candidate) {
    return null;
  }

  return normalizeConfiguredAppOrigin(
    /^https?:\/\//i.test(candidate)
      ? candidate
      : `https://${candidate}`,
  );
}

function currentWebOrigin(): string | null {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return runtimeUrlOrigin(
    process.env.NEXT_PUBLIC_VERCEL_URL ??
      process.env.VERCEL_URL ??
      process.env.CF_PAGES_URL ??
      process.env.NEXT_PUBLIC_APP_URL,
  );
}

export function resolveWebDeploymentEnvironment(args: {
  environment?: ZoeSkoulRuntimeEnvironment;
  currentOrigin?: string | null;
  nodeEnvironment?: string;
  vercelEnvironment?: string;
  cloudflarePages?: string;
  cloudflareBranch?: string;
}): ZoeSkoulRuntimeEnvironment {
  if (args.environment) {
    return args.environment;
  }

  const currentOrigin = normalizeConfiguredAppOrigin(
    args.currentOrigin,
  );

  if (currentOrigin) {
    const hostname = new URL(currentOrigin).hostname;

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    ) {
      return "development";
    }

    if (currentOrigin === getProductionAppOrigin("website")) {
      return "production";
    }

    return "preview";
  }

  if (
    args.vercelEnvironment === "preview" ||
    args.vercelEnvironment === "development" ||
    args.vercelEnvironment === "production"
  ) {
    return args.vercelEnvironment;
  }

  if (args.cloudflarePages === "1") {
    return args.cloudflareBranch === "main" ||
      args.cloudflareBranch === "production"
      ? "production"
      : "preview";
  }

  if (args.nodeEnvironment === "test") {
    return "test";
  }

  return args.nodeEnvironment === "production"
    ? "production"
    : "development";
}

export function studentAppOrigin(
  optionsOrEnvironment: StudentAppOriginOptions |
    ZoeSkoulRuntimeEnvironment = {},
): string {
  const options = typeof optionsOrEnvironment === "string"
    ? { environment: optionsOrEnvironment }
    : optionsOrEnvironment;
  const currentOrigin =
    options.currentOrigin ?? currentWebOrigin();
  const environment = resolveWebDeploymentEnvironment({
    environment: options.environment,
    currentOrigin,
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      process.env.VERCEL_ENV,
    cloudflarePages: process.env.CF_PAGES,
    cloudflareBranch: process.env.CF_PAGES_BRANCH,
  });
  const resolved = resolveAppOrigin({
    appId: "student",
    configuredOrigin:
      options.configuredOrigin ??
      process.env.NEXT_PUBLIC_STUDENT_APP_ORIGIN,
    currentOrigin,
    deploymentEnvironment: environment,
  });

  if (resolved) {
    return resolved;
  }

  const safeCurrentOrigin = normalizeConfiguredAppOrigin(
    currentOrigin,
  );

  if (safeCurrentOrigin) {
    return safeCurrentOrigin;
  }

  throw new Error(
    "NEXT_PUBLIC_STUDENT_APP_ORIGIN is required for Web preview deployments.",
  );
}

export function buildStudentAppHref(args: {
  pathname: string;
  locale?: string;
  environment?: ZoeSkoulRuntimeEnvironment;
  configuredOrigin?: string | null;
  currentOrigin?: string | null;
}): string {
  return buildLocalizedAppUrl({
    origin: studentAppOrigin({
      environment: args.environment,
      configuredOrigin: args.configuredOrigin,
      currentOrigin: args.currentOrigin,
    }),
    pathname: args.pathname,
    locale: args.locale,
  });
}
