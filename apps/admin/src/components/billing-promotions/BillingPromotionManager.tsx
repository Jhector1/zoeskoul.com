"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "@zoeskoul/api-client";
import {
  getProductionAppOrigin,
  resolveAppOrigin,
  type ZoeSkoulDeploymentEnvironment,
} from "@zoeskoul/app-config";
import { createAuthClient } from "@zoeskoul/auth-client";

type PlanScope = "monthly" | "yearly" | "both";

type Campaign = {
  id: string;
  name: string;
  percentOff: number;
  planScope: PlanScope;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  id: string | null;
  name: string;
  percentOff: string;
  planScope: PlanScope;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

function localDateTimeInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function freshForm(): FormState {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: null,
    name: "",
    percentOff: "20",
    planScope: "both",
    startsAt: localDateTimeInput(start),
    endsAt: localDateTimeInput(end),
    enabled: true,
  };
}

function campaignForm(campaign: Campaign): FormState {
  return {
    id: campaign.id,
    name: campaign.name,
    percentOff: String(campaign.percentOff),
    planScope: campaign.planScope,
    startsAt: localDateTimeInput(new Date(campaign.startsAt)),
    endsAt: localDateTimeInput(new Date(campaign.endsAt)),
    enabled: campaign.enabled,
  };
}

function deploymentEnvironment(
  currentOrigin: string,
): ZoeSkoulDeploymentEnvironment {
  const hostname = new URL(currentOrigin).hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  ) {
    return "development";
  }
  if (currentOrigin === getProductionAppOrigin("admin")) {
    return "production";
  }
  return "preview";
}

function websiteOrigin(): string | null {
  if (typeof window === "undefined") return null;
  return resolveAppOrigin({
    appId: "website",
    configuredOrigin: process.env.NEXT_PUBLIC_ZOESKOUL_WEBSITE_ORIGIN,
    currentOrigin: window.location.origin,
    deploymentEnvironment: deploymentEnvironment(window.location.origin),
  });
}

function authenticateHref(origin: string) {
  const url = new URL("/en/authenticate", origin);
  url.searchParams.set("callbackUrl", window.location.href);
  url.searchParams.set("from", "admin-promotions");
  return url.toString();
}

function message(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "The request could not be completed.";
}

function campaignState(campaign: Campaign) {
  if (!campaign.enabled) return "Disabled";
  const now = Date.now();
  const starts = new Date(campaign.startsAt).getTime();
  const ends = new Date(campaign.endsAt).getTime();
  if (now < starts) return "Scheduled";
  if (now >= ends) return "Expired";
  return "Active";
}

export function BillingPromotionManager() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState<FormState>(() => freshForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiOrigin, setApiOrigin] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...campaigns].sort(
        (a, b) =>
          new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
      ),
    [campaigns],
  );

  useEffect(() => {
    const controller = new AbortController();
    const origin = websiteOrigin();

    if (!origin) {
      setLoad({
        kind: "error",
        message:
          "The Website API origin is not configured for this Admin preview.",
      });
      return () => controller.abort();
    }

    setApiOrigin(origin);

    void (async () => {
      try {
        const session = await createAuthClient({
          apiOrigin: origin,
        }).fetchSession(controller.signal);

        if (!session.authenticated) {
          window.location.replace(authenticateHref(origin));
          return;
        }

        if (!session.capabilities.includes("admin:access")) {
          setLoad({ kind: "forbidden" });
          return;
        }

        const payload = await createApiClient({
          baseOrigin: origin,
        }).request<{ campaigns: Campaign[] }>(
          "/api/admin/billing-promotions",
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        setCampaigns(payload.campaigns);
        setLoad({ kind: "ready" });
      } catch (cause) {
        if (
          cause instanceof DOMException &&
          cause.name === "AbortError"
        ) {
          return;
        }
        setLoad({ kind: "error", message: message(cause) });
      }
    })();

    return () => controller.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiOrigin || load.kind !== "ready" || busy) return;

    setBusy(true);
    setError(null);

    try {
      const body = {
        name: form.name.trim(),
        percentOff: Number(form.percentOff),
        planScope: form.planScope,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        enabled: form.enabled,
      };

      const client = createApiClient({ baseOrigin: apiOrigin });
      const path = form.id
        ? `/api/admin/billing-promotions/${encodeURIComponent(form.id)}`
        : "/api/admin/billing-promotions";
      const payload = await client.request<{ campaign: Campaign }>(path, {
        method: form.id ? "PATCH" : "POST",
        json: body,
      });

      setCampaigns((current) => {
        const without = current.filter(
          (item) => item.id !== payload.campaign.id,
        );
        return [payload.campaign, ...without];
      });
      setForm(freshForm());
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(campaign: Campaign) {
    if (!apiOrigin || load.kind !== "ready" || busy) return;

    setBusy(true);
    setError(null);

    try {
      const payload = await createApiClient({
        baseOrigin: apiOrigin,
      }).request<{ campaign: Campaign }>(
        `/api/admin/billing-promotions/${encodeURIComponent(campaign.id)}`,
        {
          method: "PATCH",
          json: {
            name: campaign.name,
            percentOff: campaign.percentOff,
            planScope: campaign.planScope,
            startsAt: campaign.startsAt,
            endsAt: campaign.endsAt,
            enabled: !campaign.enabled,
          },
        },
      );

      setCampaigns((current) =>
        current.map((item) =>
          item.id === payload.campaign.id ? payload.campaign : item,
        ),
      );
      if (form.id === campaign.id) {
        setForm(campaignForm(payload.campaign));
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (load.kind === "loading") {
    return (
      <StatePanel
        title="Billing promotions"
        body="Checking administrator access and loading campaigns…"
      />
    );
  }

  if (load.kind === "forbidden") {
    return (
      <StatePanel
        title="Administrator access required"
        body="This account does not have the canonical admin:access capability."
      />
    );
  }

  if (load.kind === "error") {
    return (
      <StatePanel
        title="Billing promotions unavailable"
        body={load.message}
      />
    );
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={heroStyle}>
          <div>
            <a href="/" style={backLinkStyle}>← Admin dashboard</a>
            <div style={eyebrowStyle}>Billing</div>
            <h1 style={titleStyle}>Percentage-off promotions</h1>
            <p style={introStyle}>
              Schedule a discount window for monthly, yearly, or both plans.
              The learner countdown and Checkout eligibility use the same
              database-backed campaign window.
            </p>
          </div>
          <div style={securityNoteStyle}>
            Stripe coupons are created by the Web billing service. This Admin
            UI never supplies a coupon ID or trusted percentage directly to
            Checkout.
          </div>
        </header>

        {error ? <div style={errorStyle}>{error}</div> : null}

        <section style={panelStyle}>
          <div style={sectionHeadingStyle}>
            {form.id ? "Edit promotion" : "Create promotion"}
          </div>

          <form onSubmit={save} style={formGridStyle}>
            <Field label="Campaign name">
              <input
                required
                maxLength={120}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                style={inputStyle}
                placeholder="Launch week"
              />
            </Field>

            <Field label="Percentage off">
              <input
                required
                type="number"
                min={1}
                max={100}
                step={1}
                value={form.percentOff}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    percentOff: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </Field>

            <Field label="Plan">
              <select
                value={form.planScope}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    planScope: event.target.value as PlanScope,
                  }))
                }
                style={inputStyle}
              >
                <option value="both">Monthly + yearly</option>
                <option value="monthly">Monthly only</option>
                <option value="yearly">Yearly only</option>
              </select>
            </Field>

            <Field label="Status">
              <select
                value={form.enabled ? "enabled" : "disabled"}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    enabled: event.target.value === "enabled",
                  }))
                }
                style={inputStyle}
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </Field>

            <Field label="Starts">
              <input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </Field>

            <Field label="Ends / countdown reaches zero">
              <input
                required
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endsAt: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </Field>

            <div style={buttonRowStyle}>
              <button disabled={busy} type="submit" style={primaryButtonStyle}>
                {busy
                  ? "Saving…"
                  : form.id
                    ? "Save changes"
                    : "Create promotion"}
              </button>
              {form.id ? (
                <button
                  disabled={busy}
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => setForm(freshForm())}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section style={panelStyle}>
          <div style={listHeaderStyle}>
            <div>
              <div style={sectionHeadingStyle}>Campaigns</div>
              <div style={mutedStyle}>
                Enabled overlapping windows for the same plan are rejected.
              </div>
            </div>
            <div style={countPillStyle}>{sorted.length} total</div>
          </div>

          <div style={campaignGridStyle}>
            {sorted.map((campaign) => (
              <article key={campaign.id} style={campaignCardStyle}>
                <div style={campaignTopStyle}>
                  <div>
                    <div style={campaignNameStyle}>{campaign.name}</div>
                    <div style={mutedStyle}>
                      {campaign.percentOff}% off · {campaign.planScope} ·{" "}
                      {campaignState(campaign)}
                    </div>
                  </div>
                  <div style={actionRowStyle}>
                    <button
                      type="button"
                      disabled={busy}
                      style={secondaryButtonStyle}
                      onClick={() => setForm(campaignForm(campaign))}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      style={secondaryButtonStyle}
                      onClick={() => void toggle(campaign)}
                    >
                      {campaign.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
                <div style={datesStyle}>
                  <span>
                    Starts: {new Date(campaign.startsAt).toLocaleString()}
                  </span>
                  <span>
                    Ends: {new Date(campaign.endsAt).toLocaleString()}
                  </span>
                </div>
              </article>
            ))}

            {!sorted.length ? (
              <div style={emptyStyle}>No billing promotions yet.</div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label style={fieldGroupStyle}>
      <span style={fieldLabelStyle}>{props.label}</span>
      {props.children}
    </label>
  );
}

function StatePanel(props: { title: string; body: string }) {
  return (
    <main style={pageStyle}>
      <div style={{ ...shellStyle, maxWidth: 760 }}>
        <section style={panelStyle}>
          <a href="/" style={backLinkStyle}>← Admin dashboard</a>
          <h1 style={{ ...titleStyle, fontSize: 36 }}>{props.title}</h1>
          <p style={introStyle}>{props.body}</p>
        </section>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = { padding: "40px 24px 64px" };
const shellStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "grid",
  gap: 22,
};
const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 24,
  background: "rgba(255,252,246,0.68)",
  border: "1px solid var(--line)",
  borderRadius: 28,
  padding: 28,
  boxShadow: "0 18px 60px rgba(28,26,23,0.07)",
};
const eyebrowStyle: CSSProperties = {
  marginTop: 22,
  color: "var(--warm)",
  fontSize: 13,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};
const titleStyle: CSSProperties = {
  margin: "10px 0 8px",
  fontSize: 48,
  lineHeight: 1,
  fontWeight: 800,
};
const introStyle: CSSProperties = {
  margin: 0,
  maxWidth: 760,
  color: "var(--muted)",
  fontSize: 17,
  lineHeight: 1.55,
};
const securityNoteStyle: CSSProperties = {
  alignSelf: "end",
  border: "1px solid var(--line)",
  background: "rgba(255,255,255,0.55)",
  borderRadius: 18,
  padding: 16,
  color: "var(--muted)",
  fontSize: 14,
  lineHeight: 1.5,
};
const panelStyle: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 24,
  padding: 22,
  boxShadow: "0 16px 40px rgba(28,26,23,0.06)",
};
const sectionHeadingStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
};
const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
  marginTop: 18,
};
const fieldGroupStyle: CSSProperties = { display: "grid", gap: 7 };
const fieldLabelStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--muted)",
  fontWeight: 800,
};
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "1px solid var(--line)",
  background: "rgba(255,255,255,0.82)",
  color: "var(--ink)",
};
const buttonRowStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};
const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  background: "var(--accent)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};
const secondaryButtonStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 12,
  padding: "9px 12px",
  background: "rgba(255,255,255,0.7)",
  color: "var(--ink)",
  fontWeight: 800,
  cursor: "pointer",
};
const backLinkStyle: CSSProperties = {
  color: "var(--accent)",
  fontWeight: 800,
  textDecoration: "none",
};
const errorStyle: CSSProperties = {
  border: "1px solid rgba(181,70,70,0.3)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(181,70,70,0.08)",
  color: "#9f3535",
};
const listHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
};
const mutedStyle: CSSProperties = {
  marginTop: 5,
  color: "var(--muted)",
  fontSize: 13,
};
const countPillStyle: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  background: "var(--accent-soft)",
  color: "var(--accent)",
  fontSize: 13,
  fontWeight: 800,
};
const campaignGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 18,
};
const campaignCardStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 18,
  padding: 16,
  background: "rgba(255,255,255,0.55)",
};
const campaignTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};
const campaignNameStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
};
const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};
const datesStyle: CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 5,
  color: "var(--muted)",
  fontSize: 13,
};
const emptyStyle: CSSProperties = {
  border: "1px dashed var(--line)",
  borderRadius: 18,
  padding: 20,
  color: "var(--muted)",
};
