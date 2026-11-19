/** Supervised development only: renew pins for NEW sessions. Existing holders
 * retain their original kernel expiry and are never modified by this module. */
import { Resolver } from "node:dns/promises";
import { ADMIN_EGRESS_HOSTS, parseAdminEgressPins } from "./adminEgressPins.js";

const PIN_KEY = "ZOESKOUL_LEARNING_ADMIN_EGRESS_PINS_JSON";
const TTL_SECONDS = 3600;
const RENEW_MS = 15 * 60_000;
const RETRY_MS = 60_000;
const DNS_DEADLINE_MS = 8_000;
const imageID = /^sha256:[a-f0-9]{64}$/;
type Host = typeof ADMIN_EGRESS_HOSTS[number];
type Lookup = () => Promise<Record<Host, string[]>>;
type Clock = () => number;
const seconds = () => Math.floor(Date.now() / 1000);

export function renewalEligible(e: NodeJS.ProcessEnv): boolean {
  const image = e.ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE ?? "";
  const firewall = e.ZOESKOUL_LEARNING_ADMIN_EGRESS_FIREWALL_IMAGE ?? "";
  return e.RUNNER_EXECUTION_POOL === "zoeskoul-learning" &&
    e.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED === "true" &&
    e.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE === "development" &&
    e.ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY === "per-session-controlled-egress" &&
    e.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK === "false" &&
    e.ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK === "PROTECTED_LIFECYCLE_TEST_ONLY" &&
    imageID.test(image) && imageID.test(firewall) && image !== firewall;
}

/** The Runner's infrastructure resolver only. Absolute A-record queries for
 * three constants, no student-provided hostname, resolver, or policy input. */
async function resolveApprovedHosts(): Promise<Record<Host, string[]>> {
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  const timer = setTimeout(() => resolver.cancel(), DNS_DEADLINE_MS);
  try {
    const records = await Promise.all(ADMIN_EGRESS_HOSTS.map(async host => {
      const values = await resolver.resolve4(`${host}.`);
      if (values.length < 1 || values.length > 32) throw new Error("Invalid DNS answer count.");
      return [host, [...new Set(values)].sort()] as const;
    }));
    return Object.fromEntries(records) as Record<Host, string[]>;
  } finally {
    clearTimeout(timer);
    resolver.cancel();
  }
}

/** Private in-memory publication. Only a complete, validated manifest wins.
 * No process.env mutation, filesystem state, or caller-controlled refresh API. */
export class AdminEgressRenewal {
  private raw = "";
  private publishedExpiry = 0;
  private monotonicExpiry = 0;
  private inFlight: Promise<boolean> | undefined;

  constructor(seed: string, private readonly lookup: Lookup, private readonly now: Clock = seconds,
    private readonly monotonicNow: Clock = () => performance.now() / 1000) {
    try {
      const wall = now();
      const p = parseAdminEgressPins(seed, wall);
      this.raw = seed;
      this.publishedExpiry = p.expiresAt;
      this.monotonicExpiry = this.monotonicNow() + p.expiresAt - wall;
    } catch { /* An expired deployment seed is never usable. Resolve fresh. */ }
  }

  current(): string {
    // Preserve the existing minimum 60-second remaining admission window.
    const remaining = this.monotonicExpiry - this.monotonicNow();
    if (remaining < 60) throw new Error("Expired renewal snapshot.");
    const now = this.now();
    const pins = parseAdminEgressPins(this.raw, now);
    // Never grant a new kernel lease longer than the monotonic budget after
    // a backwards wall-clock adjustment. The initializer subtracts 2 seconds.
    const expiresAt = Math.min(pins.expiresAt, now + Math.ceil(remaining));
    return expiresAt === pins.expiresAt ? this.raw : JSON.stringify({ ...pins, expiresAt });
  }

  expiry(): number { return this.publishedExpiry; }

  refresh(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    // Defer execution so even a synchronous lookup exception is single-flight.
    const job = Promise.resolve().then(async () => {
      try {
        const hosts = await this.lookup();
        const now = this.now();
        const raw = JSON.stringify({ expiresAt: now + TTL_SECONDS, hosts });
        const next = parseAdminEgressPins(raw, now);
        // Never replace a newer snapshot with a backwards-clock candidate.
        if (next.expiresAt < this.publishedExpiry) return false;
        this.raw = raw;
        this.publishedExpiry = next.expiresAt;
        this.monotonicExpiry = this.monotonicNow() + TTL_SECONDS;
        return true;
      } catch { return false; }
    });
    this.inFlight = job;
    void job.finally(() => { if (this.inFlight === job) this.inFlight = undefined; });
    return job;
  }
}

let runtime: AdminEgressRenewal | undefined;

/** Only production call sites using actual process.env see runtime snapshots.
 * Explicit configuration objects retain the original static validation path. */
export function adminEgressPinsForConfiguration(e: NodeJS.ProcessEnv): string {
  if (e === process.env && runtime) {
    if (!renewalEligible(e)) throw new Error("Protected renewal scope no longer valid.");
    return runtime.current(); // Never fall back to a stale deployment seed.
  }
  return e[PIN_KEY] ?? "";
}

/** Idempotent, sequential background loop. Never changes operator state,
 * grants, session deadlines, Docker resources, or other execution pools. */
export function startAdminEgressRenewal(): void {
  if (runtime || !renewalEligible(process.env)) return;
  const controller = new AdminEgressRenewal(process.env[PIN_KEY] ?? "", resolveApprovedHosts);
  runtime = controller;
  const tick = async () => {
    if (!renewalEligible(process.env)) return;
    const ok = await controller.refresh();
    console[ok ? "info" : "warn"]("RUNNER protected egress renewal", {
      state: ok ? "published" : "failed",
      scope: "new-sessions-only",
      expiresAt: controller.expiry(),
    });
    const timer = setTimeout(() => { void tick(); }, ok ? RENEW_MS : RETRY_MS);
    timer.unref?.();
  };
  void tick();
}
