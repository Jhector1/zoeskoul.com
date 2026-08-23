import { createApiClient } from "@zoeskoul/api-client";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  Badge,
  EmptyState,
  PageHeader,
  PageState,
  Panel,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";

type PlanScope = "monthly" | "yearly" | "both";
type CouponDuration = "once" | "repeating" | "forever";

type Campaign = {
  id: string;
  name: string;
  percentOff: number;
  planScope: PlanScope;
  couponDuration: CouponDuration;
  couponDurationMonths: number | null;
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
  couponDuration: CouponDuration;
  couponDurationMonths: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

function localDateTimeInput(date: Date) {
  const shifted = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
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
    couponDuration: "once",
    couponDurationMonths: "",
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
    couponDuration: campaign.couponDuration ?? "once",
    couponDurationMonths:
      campaign.couponDuration === "repeating"
        ? String(campaign.couponDurationMonths ?? "")
        : "",
    startsAt: localDateTimeInput(new Date(campaign.startsAt)),
    endsAt: localDateTimeInput(new Date(campaign.endsAt)),
    enabled: campaign.enabled,
  };
}

function message(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "The request could not be completed.";
}

function couponDurationLabel(campaign: Campaign) {
  const duration = campaign.couponDuration ?? "once";
  if (duration === "repeating") {
    const months = campaign.couponDurationMonths ?? 0;
    return months === 1 ? "first month" : `first ${months} months`;
  }
  if (duration === "forever") return "ongoing";
  return "first payment only";
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

function stateTone(
  state: ReturnType<typeof campaignState>,
): "neutral" | "good" | "warn" {
  if (state === "Active") return "good";
  if (state === "Scheduled") return "warn";
  return "neutral";
}

export function BillingPromotionManager(props: {
  apiOrigin: string;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState<FormState>(() => freshForm());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...campaigns].sort(
        (a, b) =>
          new Date(b.startsAt).getTime() -
          new Date(a.startsAt).getTime(),
      ),
    [campaigns],
  );

  useEffect(() => {
    const controller = new AbortController();
    const client = createApiClient({
      baseOrigin: props.apiOrigin,
    });

    setLoading(true);
    setLoadError(null);

    void client
      .request<{ campaigns: Campaign[] }>(
        "/api/admin/billing-promotions",
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        },
      )
      .then((payload) => {
        if (controller.signal.aborted) return;
        setCampaigns(payload.campaigns);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(message(error));
        setLoading(false);
      });

    return () => controller.abort();
  }, [props.apiOrigin]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setSaveError(null);

    try {
      const body = {
        name: form.name.trim(),
        percentOff: Number(form.percentOff),
        planScope: form.planScope,
        couponDuration: form.couponDuration,
        couponDurationMonths:
          form.couponDuration === "repeating"
            ? Number(form.couponDurationMonths)
            : null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        enabled: form.enabled,
      };

      const client = createApiClient({
        baseOrigin: props.apiOrigin,
      });

      const path = form.id
        ? `/api/admin/billing-promotions/${encodeURIComponent(form.id)}`
        : "/api/admin/billing-promotions";

      const payload = await client.request<{ campaign: Campaign }>(
        path,
        {
          method: form.id ? "PATCH" : "POST",
          json: body,
        },
      );

      setCampaigns((current) => [
        payload.campaign,
        ...current.filter(
          (item) => item.id !== payload.campaign.id,
        ),
      ]);
      setForm(freshForm());
    } catch (error) {
      setSaveError(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(campaign: Campaign) {
    if (busy) return;
    setBusy(true);
    setSaveError(null);

    try {
      const client = createApiClient({
        baseOrigin: props.apiOrigin,
      });

      const payload = await client.request<{ campaign: Campaign }>(
        `/api/admin/billing-promotions/${encodeURIComponent(campaign.id)}`,
        {
          method: "PATCH",
          json: {
            name: campaign.name,
            percentOff: campaign.percentOff,
            planScope: campaign.planScope,
            couponDuration: campaign.couponDuration ?? "once",
            couponDurationMonths:
              campaign.couponDuration === "repeating"
                ? campaign.couponDurationMonths
                : null,
            startsAt: campaign.startsAt,
            endsAt: campaign.endsAt,
            enabled: !campaign.enabled,
          },
        },
      );

      setCampaigns((current) =>
        current.map((item) =>
          item.id === payload.campaign.id
            ? payload.campaign
            : item,
        ),
      );
    } catch (error) {
      setSaveError(message(error));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageState
        kind="loading"
        title="Loading promotions"
      />
    );
  }

  if (loadError) {
    return (
      <PageState
        kind="error"
        title="Promotions unavailable"
        message={loadError}
      />
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Billing"
        title="Promotions"
        description="Schedule and manage subscription discounts without exposing Stripe or database state to Admin."
      />

      {saveError ? (
        <div className="notice notice-error">{saveError}</div>
      ) : null}

      <section className="promotion-layout">
        <Panel
          title={form.id ? "Edit campaign" : "New campaign"}
          description="One focused form for campaign economics and timing."
        >
          <form className="form-stack" onSubmit={save}>
            <label>
              <span>Name</span>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Launch week"
              />
            </label>

            <div className="form-two">
              <label>
                <span>Discount</span>
                <div className="input-suffix">
                  <input
                    required
                    min="1"
                    max="100"
                    type="number"
                    value={form.percentOff}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        percentOff: event.target.value,
                      }))
                    }
                  />
                  <span>%</span>
                </div>
              </label>

              <label>
                <span>Plan</span>
                <select
                  value={form.planScope}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      planScope: event.target.value as PlanScope,
                    }))
                  }
                >
                  <option value="both">Monthly + yearly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label>
                <span>Coupon duration</span>
                <select
                  value={form.couponDuration}
                  onChange={(event) => {
                    const couponDuration =
                      event.target.value as CouponDuration;
                    setForm((current) => ({
                      ...current,
                      couponDuration,
                      couponDurationMonths:
                        couponDuration === "repeating"
                          ? current.couponDurationMonths || "3"
                          : "",
                    }));
                  }}
                >
                  <option value="once">First payment only</option>
                  <option value="repeating">Multiple months</option>
                  <option value="forever">Forever</option>
                </select>
              </label>
              {form.couponDuration === "repeating" ? (
                <label>
                  <span>Number of months</span>
                  <input
                    required
                    min="1"
                    step="1"
                    type="number"
                    value={form.couponDurationMonths}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        couponDurationMonths: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
            </div>

            <div className="form-two">
              <label>
                <span>Starts</span>
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
                />
              </label>

              <label>
                <span>Ends</span>
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
                />
              </label>
            </div>

            <label className="check-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
              />
              <span>
                <strong>Enabled</strong>
                <small>
                  The campaign can apply during its active window.
                </small>
              </span>
            </label>

            <div className="form-actions">
              <button
                className="button button-primary"
                disabled={busy}
                type="submit"
              >
                {busy
                  ? "Saving…"
                  : form.id
                    ? "Save changes"
                    : "Create campaign"}
              </button>

              {form.id ? (
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => setForm(freshForm())}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </Panel>

        <Panel
          title="Campaigns"
          description={`${sorted.length} configured campaign${sorted.length === 1 ? "" : "s"}.`}
        >
          <div className="campaign-list">
            {sorted.length ? (
              sorted.map((campaign) => {
                const state = campaignState(campaign);
                return (
                  <article className="campaign-card" key={campaign.id}>
                    <div className="campaign-card-top">
                      <div>
                        <div className="campaign-title-row">
                          <strong>{campaign.name}</strong>
                          <Badge tone={stateTone(state)}>{state}</Badge>
                        </div>
                        <p>
                          {campaign.percentOff}% off ·{" "}
                          {campaign.planScope === "both"
                            ? "Monthly + yearly"
                            : campaign.planScope}
                          {" · "}
                          {couponDurationLabel(campaign)}
                        </p>
                      </div>
                      <div className="campaign-actions">
                        <button
                          className="button button-small button-ghost"
                          type="button"
                          onClick={() => setForm(campaignForm(campaign))}
                        >
                          Edit
                        </button>
                        <button
                          className="button button-small button-secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void toggle(campaign)}
                        >
                          {campaign.enabled ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </div>

                    <div className="campaign-dates">
                      <span>
                        Starts {formatDateTime(campaign.startsAt)}
                      </span>
                      <span>
                        Ends {formatDateTime(campaign.endsAt)}
                      </span>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState>No billing promotions yet.</EmptyState>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}
