/** Shared immutable-session pin manifest validation. */
export const ADMIN_EGRESS_HOSTS = ["archive.ubuntu.com", "security.ubuntu.com", "example.com"] as const;
export type PinManifest = { expiresAt: number; hosts: Record<string,string[]> };
export function ipv4Value(ip: string): number {
  if (!/^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/.test(ip)) throw new Error("Invalid IPv4 pin.");
  const bytes = ip.split(".").map(Number);
  if (bytes.some(v => v > 255)) throw new Error("Invalid IPv4 pin.");
  return bytes.reduce((n,b) => n*256+b,0);
}
function publicPin(ip: string): boolean {
  const value = ipv4Value(ip);
  return !["0.0.0.0/8","10.0.0.0/8","100.64.0.0/10","127.0.0.0/8","169.254.0.0/16","172.16.0.0/12","192.0.0.0/24","192.0.2.0/24","192.88.99.0/24","192.168.0.0/16","198.18.0.0/15","198.51.100.0/24","203.0.113.0/24","224.0.0.0/3"].some(c => {
    const [a,p] = c.split("/"); const first=ipv4Value(a); return value>=first && value<first+2**(32-Number(p));
  });
}
export function parseAdminEgressPins(raw: string, now = Math.floor(Date.now()/1000)): PinManifest {
  if (raw.length > 8192) throw new Error("Oversized egress pins.");
  const pins = JSON.parse(raw) as PinManifest;
  if (!pins || Object.keys(pins).sort().join(",") !== "expiresAt,hosts" || !Number.isSafeInteger(pins.expiresAt) || pins.expiresAt-now<60 || pins.expiresAt-now>3600 || !pins.hosts || Object.keys(pins.hosts).sort().join(",") !== [...ADMIN_EGRESS_HOSTS].sort().join(",")) throw new Error("Invalid or expired egress pins.");
  for (const host of ADMIN_EGRESS_HOSTS) {
    const entries=pins.hosts[host];
    if (!Array.isArray(entries) || entries.length<1 || entries.length>32 || new Set(entries).size!==entries.length || entries.some(ip=>typeof ip!=="string" || !publicPin(ip))) throw new Error("Unsafe egress pins.");
  }
  return pins;
}
