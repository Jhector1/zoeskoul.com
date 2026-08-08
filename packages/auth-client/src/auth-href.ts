export function buildAuthenticateHref(callbackUrl: string) {
    return {
        pathname: "/authenticate",
        query: { callbackUrl },
    } as const;
}