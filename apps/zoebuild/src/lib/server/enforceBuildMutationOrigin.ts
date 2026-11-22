/** Exact origin for ZoeBuild source/history mutations, including local HTTP.
 * Production requires explicitly configured APP_ORIGIN. Development/test may
 * derive a fallback solely from a loopback HTTP(S) request URL. Do not trust
 * forwarded host headers. An Origin header, when present, takes precedence.
 */
export function enforceBuildMutationOrigin(req: Request): boolean {
  try {
    const configured = process.env.APP_ORIGIN;
    let allowed: string;
    if (configured !== undefined) {
      const target = new URL(configured);
      if (!['http:', 'https:'].includes(target.protocol) || target.origin !== configured) return false;
      allowed = configured;
    } else {
      if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') return false;
      const target = new URL(req.url);
      if (!['http:', 'https:'].includes(target.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) return false;
      allowed = target.origin;
    }
    const origin = req.headers.get('origin');
    if (origin !== null) return origin === allowed;
    const referer = req.headers.get('referer');
    return referer !== null && new URL(referer).origin === allowed;
  } catch {
    return false;
  }
}
