import { redirect } from "next/navigation";
import { buildAuthenticateHref } from "@/lib/auth/auth-href";
import { buildLocalCallbackUrl } from "@/lib/auth/callback-url";

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