import { redirect } from "next/navigation";
import { buildAuthenticateHref } from "@zoeskoul/auth-client/auth-href";
import { buildLocalCallbackUrl } from "@zoeskoul/auth-client/callback-url";

export function redirectToSignIn(args: {
    locale: string;
    pathname: string;
    search?: string;
}) {
    const callbackUrl = buildLocalCallbackUrl({
        locale: args.locale,
        pathname: args.pathname,
        search: args.search || "",
    });

    const href = buildAuthenticateHref(callbackUrl);
    const qs = new URLSearchParams(href.query).toString();

    redirect(`${href.pathname}?${qs}`);
}