/** ZoeLearning V6 browser canary: only the local Next.js development server may opt in. */
export function selectDevV6FileSyncMode(args: {
    nodeEnv: string | undefined;
    enabled: string | undefined;
    hasUser: boolean;
}): "v5" | "v6" {
    return args.nodeEnv === "development" &&
        args.enabled === "true" &&
        args.hasUser
        ? "v6"
        : "v5";
}
