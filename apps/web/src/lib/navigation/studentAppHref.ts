import {
  buildLocalizedAppUrl,
  getLocalAppOrigin,
  getProductionAppOrigin,
} from "@zoeskoul/app-config";

export type ZoeSkoulRuntimeEnvironment =
  | "development"
  | "test"
  | "production";

export function studentAppOrigin(
  environment: ZoeSkoulRuntimeEnvironment =
    process.env.NODE_ENV,
): string {
  return environment === "production"
    ? getProductionAppOrigin("student")
    : getLocalAppOrigin("student");
}

export function buildStudentAppHref(args: {
  pathname: string;
  locale?: string;
  environment?: ZoeSkoulRuntimeEnvironment;
}): string {
  return buildLocalizedAppUrl({
    origin: studentAppOrigin(args.environment),
    pathname: args.pathname,
    locale: args.locale,
  });
}
