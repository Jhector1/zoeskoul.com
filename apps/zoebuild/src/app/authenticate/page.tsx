import {
  redirect,
} from "next/navigation";

import {
  buildZoeBuildWebAuthenticateUrl,
} from "@/lib/webAuthHandoff";

export const metadata = {
  title: "Sign in",
};

export default async function ZoeBuildAuthenticatePage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    locale?: string;
  }>;
}) {
  const params = await searchParams;

  redirect(
    buildZoeBuildWebAuthenticateUrl({
      callbackUrl:
        params.callbackUrl,
      locale:
        params.locale,
    }),
  );
}
