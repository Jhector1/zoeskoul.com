import {
  createApiClient,
} from "@zoeskoul/api-client";
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

type CampaignStatus =
  | "draft"
  | "published"
  | "archived";

type CampaignAudience =
  | "all"
  | "free"
  | "plus";

type DisplayFrequency =
  | "once"
  | "daily"
  | "always";

type Campaign = {
  id: string;
  name: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  status: CampaignStatus;
  audience: CampaignAudience;
  displayFrequency: DisplayFrequency;
  priority: number;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
  tutoringGrantMinutes: number | null;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  id: string | null;
  name: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  status: CampaignStatus;
  audience: CampaignAudience;
  displayFrequency: DisplayFrequency;
  priority: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
  tutoringGrantMinutes: string;
};

function localDateTimeInput(date: Date) {
  const shifted = new Date(
    date.getTime() -
      date.getTimezoneOffset() *
        60_000,
  );
  return shifted
    .toISOString()
    .slice(0, 16);
}

function blankForm(): FormState {
  const start = new Date();
  const end = new Date(
    start.getTime() +
      7 * 24 * 60 * 60 * 1000,
  );

  return {
    id: null,
    name: "",
    title: "",
    body: "",
    ctaLabel: "",
    ctaHref: "",
    status: "draft",
    audience: "all",
    displayFrequency: "once",
    priority: "100",
    startsAt:
      localDateTimeInput(start),
    endsAt:
      localDateTimeInput(end),
    enabled: false,
    tutoringGrantMinutes: "",
  };
}

function welcomeOfferForm(): FormState {
  const start = new Date();
  const end = new Date(
    start.getTime() +
      14 * 24 * 60 * 60 * 1000,
  );

  return {
    id: null,
    name:
      "60-minute tutoring campaign",
    title:
      "60 tutoring minutes are on us",
    body:
      "For a limited time, eligible ZoeSkoul learners receive 60 promotional tutoring minutes automatically. Use them when you need one-on-one help from a human tutor.",
    ctaLabel: "Request tutoring",
    ctaHref: "/tutoring-sessions",
    status: "draft",
    audience: "all",
    displayFrequency: "daily",
    priority: "20",
    startsAt:
      localDateTimeInput(start),
    endsAt:
      localDateTimeInput(end),
    enabled: false,
    tutoringGrantMinutes: "60",
  };
}

function formFromCampaign(
  campaign: Campaign,
): FormState {
  return {
    id: campaign.id,
    name: campaign.name,
    title: campaign.title,
    body: campaign.body,
    ctaLabel:
      campaign.ctaLabel ?? "",
    ctaHref:
      campaign.ctaHref ?? "",
    status: campaign.status,
    audience: campaign.audience,
    displayFrequency:
      campaign.displayFrequency,
    priority:
      String(campaign.priority),
    startsAt:
      localDateTimeInput(
        new Date(campaign.startsAt),
      ),
    endsAt:
      localDateTimeInput(
        new Date(campaign.endsAt),
      ),
    enabled: campaign.enabled,
    tutoringGrantMinutes:
      campaign.tutoringGrantMinutes ==
      null
        ? ""
        : String(
            campaign.tutoringGrantMinutes,
          ),
  };
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Campaign action failed.";
}

function stateLabel(campaign: Campaign) {
  if (
    campaign.status === "archived"
  ) {
    return "Archived";
  }

  if (
    campaign.status !== "published"
  ) {
    return "Draft";
  }

  if (!campaign.enabled) {
    return "Disabled";
  }

  const now = Date.now();
  const starts =
    new Date(
      campaign.startsAt,
    ).getTime();
  const ends =
    new Date(
      campaign.endsAt,
    ).getTime();

  if (now < starts) return "Scheduled";
  if (now >= ends) return "Expired";
  return "Active";
}

function tone(
  label: ReturnType<
    typeof stateLabel
  >,
): "neutral" | "good" | "warn" {
  if (label === "Active") {
    return "good";
  }
  if (label === "Scheduled") {
    return "warn";
  }
  return "neutral";
}

export function StudentCampaignManager(
  props: {
    apiOrigin: string;
  },
) {
  const [campaigns, setCampaigns] =
    useState<Campaign[]>([]);
  const [form, setForm] =
    useState<FormState>(
      () => blankForm(),
    );
  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);

  const client = useMemo(
    () =>
      createApiClient({
        baseOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );

  const sorted = useMemo(
    () =>
      [...campaigns].sort(
        (left, right) =>
          new Date(
            right.startsAt,
          ).getTime() -
          new Date(
            left.startsAt,
          ).getTime(),
      ),
    [campaigns],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);

    void client
      .request<{
        campaigns: Campaign[];
      }>(
        "/api/admin/student-campaigns",
        {
          method: "GET",
          cache: "no-store",
        },
      )
      .then((payload) => {
        if (!active) return;
        setCampaigns(
          payload.campaigns,
        );
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client]);

  function campaignPayload(
    source: FormState,
  ) {
    return {
      name: source.name.trim(),
      title: source.title.trim(),
      body: source.body.trim(),
      ctaLabel:
        source.ctaLabel.trim() ||
        null,
      ctaHref:
        source.ctaHref.trim() ||
        null,
      status: source.status,
      audience: source.audience,
      displayFrequency:
        source.displayFrequency,
      priority:
        Number(source.priority),
      startsAt:
        new Date(
          source.startsAt,
        ).toISOString(),
      endsAt:
        new Date(
          source.endsAt,
        ).toISOString(),
      enabled: source.enabled,
      tutoringGrantMinutes:
        source.tutoringGrantMinutes
          ? Number(
              source.tutoringGrantMinutes,
            )
          : null,
    };
  }

  async function save(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const path = form.id
        ? `/api/admin/student-campaigns/${encodeURIComponent(
            form.id,
          )}`
        : "/api/admin/student-campaigns";

      const response =
        await client.request<{
          campaign: Campaign;
        }>(
          path,
          {
            method:
              form.id
                ? "PATCH"
                : "POST",
            json:
              campaignPayload(form),
          },
        );

      setCampaigns((current) => [
        response.campaign,
        ...current.filter(
          (campaign) =>
            campaign.id !==
            response.campaign.id,
        ),
      ]);

      setForm(
        formFromCampaign(
          response.campaign,
        ),
      );

      setNotice(
        form.id
          ? "Campaign saved."
          : "Campaign created as a draft. Publish it when you are ready.",
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function quickUpdate(
    campaign: Campaign,
    patch: Partial<{
      status: CampaignStatus;
      enabled: boolean;
    }>,
  ) {
    if (busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const state =
        formFromCampaign(campaign);
      state.status =
        patch.status ??
        campaign.status;
      state.enabled =
        patch.enabled ??
        campaign.enabled;

      const response =
        await client.request<{
          campaign: Campaign;
        }>(
          `/api/admin/student-campaigns/${encodeURIComponent(
            campaign.id,
          )}`,
          {
            method: "PATCH",
            json:
              campaignPayload(state),
          },
        );

      setCampaigns((current) =>
        current.map((item) =>
          item.id === campaign.id
            ? response.campaign
            : item,
        ),
      );

      if (
        form.id ===
        campaign.id
      ) {
        setForm(
          formFromCampaign(
            response.campaign,
          ),
        );
      }

      setNotice(
        "Campaign updated.",
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PageState
        kind="loading"
        title="Loading campaigns"
        message="Opening Student announcements and promotions."
      />
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Student communications"
        title="Campaigns"
        description="Publish reusable in-app announcements, temporary learner offers, and optional tutoring-minute promotions."
      />

      <div className="form-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setForm(
              welcomeOfferForm(),
            );
            setNotice(null);
            setError(null);
          }}
        >
          Use 60-minute tutoring template
        </button>

        <button
          type="button"
          className="button button-ghost"
          onClick={() => {
            setForm(blankForm());
            setNotice(null);
            setError(null);
          }}
        >
          Blank campaign
        </button>
      </div>

      {error ? (
        <div
          className="notice notice-error"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="notice">
          {notice}
        </div>
      ) : null}

      <section className="promotion-layout">
        <Panel
          title={
            form.id
              ? "Edit campaign"
              : "New campaign"
          }
          description="Draft first. Published + enabled campaigns can appear in Student and can grant configured tutoring minutes."
        >
          <form
            className="form-stack"
            onSubmit={save}
          >
            <label>
              <span>Internal name</span>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name:
                      event.target.value,
                  }))
                }
                placeholder="Fall tutoring launch"
              />
            </label>

            <label>
              <span>Popup title</span>
              <input
                required
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title:
                      event.target.value,
                  }))
                }
              />
            </label>

            <label>
              <span>Message</span>
              <textarea
                required
                rows={5}
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    body:
                      event.target.value,
                  }))
                }
              />
            </label>

            <div className="form-two">
              <label>
                <span>CTA label</span>
                <input
                  value={
                    form.ctaLabel
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      ctaLabel:
                        event.target.value,
                    }))
                  }
                  placeholder="Request tutoring"
                />
              </label>

              <label>
                <span>
                  CTA destination
                </span>
                <input
                  value={
                    form.ctaHref
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      ctaHref:
                        event.target.value,
                    }))
                  }
                  placeholder="/tutoring-sessions"
                />
              </label>
            </div>

            <div className="form-two">
              <label>
                <span>Audience</span>
                <select
                  value={
                    form.audience
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      audience:
                        event.target
                          .value as CampaignAudience,
                    }))
                  }
                >
                  <option value="all">
                    All learners
                  </option>
                  <option value="free">
                    Free learners
                  </option>
                  <option value="plus">
                    Plus learners
                  </option>
                </select>
              </label>

              <label>
                <span>
                  Popup frequency
                </span>
                <select
                  value={
                    form.displayFrequency
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayFrequency:
                        event.target
                          .value as DisplayFrequency,
                    }))
                  }
                >
                  <option value="once">
                    Once per learner
                  </option>
                  <option value="daily">
                    Once per day
                  </option>
                  <option value="always">
                    Every app visit
                  </option>
                </select>
              </label>
            </div>

            <div className="form-two">
              <label>
                <span>
                  Promotional tutoring minutes
                </span>
                <input
                  min="1"
                  max="10080"
                  step="1"
                  type="number"
                  value={
                    form.tutoringGrantMinutes
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      tutoringGrantMinutes:
                        event.target.value,
                    }))
                  }
                  placeholder="No grant"
                />
                <small>
                  Granted once to every matching learner while this campaign is active. Promotional minutes are non-refundable.
                </small>
              </label>

              <label>
                <span>Priority</span>
                <input
                  min="0"
                  max="10000"
                  step="1"
                  type="number"
                  value={
                    form.priority
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority:
                        event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="form-two">
              <label>
                <span>Starts</span>
                <input
                  required
                  type="datetime-local"
                  value={
                    form.startsAt
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startsAt:
                        event.target.value,
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
                      endsAt:
                        event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="form-two">
              <label>
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(event) => {
                    const status =
                      event.target
                        .value as CampaignStatus;

                    setForm((current) => ({
                      ...current,
                      status,
                      enabled:
                        status ===
                        "published"
                          ? current.enabled
                          : false,
                    }));
                  }}
                >
                  <option value="draft">
                    Draft
                  </option>
                  <option value="published">
                    Published
                  </option>
                  <option value="archived">
                    Archived
                  </option>
                </select>
              </label>

              <label className="check-row">
                <input
                  type="checkbox"
                  disabled={
                    form.status !==
                    "published"
                  }
                  checked={
                    form.enabled
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      enabled:
                        event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Enabled</strong>
                  <small>
                    Only published + enabled campaigns are live.
                  </small>
                </span>
              </label>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="button button-primary"
                disabled={busy}
              >
                {busy
                  ? "Saving…"
                  : form.id
                    ? "Save changes"
                    : "Create campaign"}
              </button>

              {form.id ? (
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() =>
                    setForm(
                      blankForm(),
                    )
                  }
                >
                  Close edit
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
              sorted.map(
                (campaign) => {
                  const label =
                    stateLabel(
                      campaign,
                    );

                  return (
                    <article
                      className="campaign-card"
                      key={
                        campaign.id
                      }
                    >
                      <div className="campaign-card__top">
                        <div>
                          <div className="campaign-card__title">
                            <strong>
                              {
                                campaign.name
                              }
                            </strong>
                            <Badge
                              tone={
                                tone(
                                  label,
                                )
                              }
                            >
                              {label}
                            </Badge>
                          </div>
                          <p>
                            {
                              campaign.audience
                            }
                            {" · "}
                            {
                              campaign.displayFrequency
                            }
                            {campaign.tutoringGrantMinutes
                              ? ` · ${campaign.tutoringGrantMinutes} tutoring min`
                              : ""}
                          </p>
                        </div>

                        <div className="campaign-actions">
                          <button
                            type="button"
                            className="button button-small button-ghost"
                            onClick={() =>
                              setForm(
                                formFromCampaign(
                                  campaign,
                                ),
                              )
                            }
                          >
                            Edit
                          </button>

                          {campaign.status !==
                          "published" ? (
                            <button
                              type="button"
                              className="button button-small button-secondary"
                              disabled={
                                busy
                              }
                              onClick={() =>
                                void quickUpdate(
                                  campaign,
                                  {
                                    status:
                                      "published",
                                    enabled:
                                      true,
                                  },
                                )
                              }
                            >
                              Publish
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button button-small button-secondary"
                              disabled={
                                busy
                              }
                              onClick={() =>
                                void quickUpdate(
                                  campaign,
                                  {
                                    enabled:
                                      !campaign.enabled,
                                  },
                                )
                              }
                            >
                              {campaign.enabled
                                ? "Disable"
                                : "Enable"}
                            </button>
                          )}

                          {campaign.status !==
                          "archived" ? (
                            <button
                              type="button"
                              className="button button-small button-ghost"
                              disabled={
                                busy
                              }
                              onClick={() =>
                                void quickUpdate(
                                  campaign,
                                  {
                                    status:
                                      "archived",
                                    enabled:
                                      false,
                                  },
                                )
                              }
                            >
                              Archive
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="campaign-dates">
                        <span>
                          Starts{" "}
                          {formatDateTime(
                            campaign.startsAt,
                          )}
                        </span>
                        <span>
                          Ends{" "}
                          {formatDateTime(
                            campaign.endsAt,
                          )}
                        </span>
                      </div>
                    </article>
                  );
                },
              )
            ) : (
              <EmptyState>
                No Student campaigns yet.
              </EmptyState>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}
