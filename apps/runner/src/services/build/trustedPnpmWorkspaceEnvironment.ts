/**
 * Trusted one-shot pnpm cache/store locations.
 *
 * Every trusted job gets its own isolated, disposable /workspace bind mount.
 * Keep pnpm's content-addressable store on the same disk as node_modules,
 * rather than HOME=/tmp (the bounded 256 MiB tmpfs). No shared tenant store.
 *
 * pnpm 10 reads npm_config_store_dir; pnpm 11 reads pnpm_config_store_dir.
 * Both are runner-owned, never supplied by project files or the client.
 */
export const TRUSTED_PNPM_STORE_DIR = "/workspace/.zoebuild-runtime/pnpm-store";

export function trustedPnpmWorkspaceEnvironment(): readonly string[] {
  return [
    `npm_config_store_dir=${TRUSTED_PNPM_STORE_DIR}`,
    `pnpm_config_store_dir=${TRUSTED_PNPM_STORE_DIR}`,
    "XDG_CACHE_HOME=/workspace/.zoebuild-runtime/cache",
    "XDG_DATA_HOME=/workspace/.zoebuild-runtime/data",
    "XDG_STATE_HOME=/workspace/.zoebuild-runtime/state",
  ];
}
