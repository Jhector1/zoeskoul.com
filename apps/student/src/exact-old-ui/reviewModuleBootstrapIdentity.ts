export function buildReviewModuleBootstrapIdentity(args: {
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  return [args.locale, args.subjectSlug, args.moduleSlug].join(":");
}

export function canRenderReviewModuleBootstrapData(args: {
  requestIdentity: string;
  stateIdentity: string;
  status: "loading" | "ready" | "error";
}) {
  return (
    args.status === "ready" &&
    args.requestIdentity === args.stateIdentity
  );
}
