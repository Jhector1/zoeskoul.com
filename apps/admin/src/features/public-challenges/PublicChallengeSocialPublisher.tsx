import { useEffect, useMemo, useState } from "react";
import type {
  PublicChallengeSocialAdminResponse,
  PublicChallengeSocialAutomationSettings,
  PublicChallengeSocialProvider,
  PublicChallengeSocialPublishResponse,
} from "@zoeskoul/api-contracts";

import { adminFetch } from "@/lib/adminApi";

type Challenge = {
  code: string;
  url: string;
  shareTitle: string;
  shareDescription: string;
  imageUrl: string | null;
};

async function readJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok || !payload) {
    throw new Error(
      (payload && "error" in payload && payload.error) || fallback,
    );
  }
  return payload as T;
}

const LABELS: Record<PublicChallengeSocialProvider, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
};

export default function PublicChallengeSocialPublisher(props: {
  challenge: Challenge | null;
}) {
  const [state, setState] =
    useState<PublicChallengeSocialAdminResponse | null>(null);
  const [settings, setSettings] =
    useState<PublicChallengeSocialAutomationSettings | null>(null);
  const [busy, setBusy] =
    useState<"load" | "save" | "post" | null>("load");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await adminFetch(
      "/api/admin/public-challenges/social",
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      },
    );
    const payload = await readJson<PublicChallengeSocialAdminResponse>(
      response,
      "Social publishing settings could not be loaded.",
    );
    setState(payload);
    setSettings(payload.automation);
  }

  useEffect(() => {
    const controller = new AbortController();
    setBusy("load");

    adminFetch("/api/admin/public-challenges/social", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) =>
        readJson<PublicChallengeSocialAdminResponse>(
          response,
          "Social publishing settings could not be loaded.",
        ),
      )
      .then((payload) => {
        if (controller.signal.aborted) return;
        setState(payload);
        setSettings(payload.automation);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Social publishing settings could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(null);
      });

    return () => controller.abort();
  }, []);

  const selectedConfiguredProviders = useMemo(() => {
    if (!state || !settings) return [];
    const configured = new Set(
      state.providers
        .filter((provider) => provider.configured)
        .map((provider) => provider.provider),
    );
    return settings.providers.filter((provider) =>
      configured.has(provider),
    );
  }, [settings, state]);

  function toggleProvider(provider: PublicChallengeSocialProvider) {
    if (!settings) return;
    const selected = new Set(settings.providers);
    if (selected.has(provider)) selected.delete(provider);
    else selected.add(provider);

    setSettings({
      ...settings,
      providers: [...selected],
    });
    setNotice(null);
    setError(null);
  }

  async function save() {
    if (!settings || busy) return;
    setBusy("save");
    setError(null);
    setNotice(null);

    try {
      const response = await adminFetch(
        "/api/admin/public-challenges/social",
        {
          method: "PUT",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        },
      );

      await readJson<{ ok: true }>(
        response,
        "Could not save daily social posting settings.",
      );
      await refresh();
      setNotice(
        settings.enabled
          ? "Daily social posting is enabled."
          : "Daily social posting is disabled.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save daily social posting settings.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function postNow() {
    if (
      !props.challenge ||
      !selectedConfiguredProviders.length ||
      busy
    ) {
      return;
    }

    setBusy("post");
    setError(null);
    setNotice(null);

    try {
      const response = await adminFetch(
        "/api/admin/public-challenges/social",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeCode: props.challenge.code,
            providers: selectedConfiguredProviders,
          }),
        },
      );

      const result =
        await readJson<PublicChallengeSocialPublishResponse>(
          response,
          "Could not publish this challenge.",
        );

      const published = result.results.filter(
        (item) => item.status === "published",
      ).length;
      const skipped = result.results.filter(
        (item) => item.status === "skipped",
      ).length;
      const failed = result.results.filter(
        (item) => item.status === "failed",
      );

      setNotice(
        `${published} published${
          skipped ? ` · ${skipped} already posted` : ""
        }.`,
      );

      if (failed.length) {
        setError(
          failed
            .map(
              (item) =>
                `${LABELS[item.provider]}: ${item.error}`,
            )
            .join(" · "),
        );
      }

      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not publish this challenge.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Social publishing
          </div>
          <h2 className="mt-1 text-lg font-semibold text-neutral-950">
            Post challenges to social media
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Manual posts use the challenge link above. Daily automation uses
            the latest active public challenge for the selected language.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void postNow()}
          disabled={
            !props.challenge ||
            !selectedConfiguredProviders.length ||
            busy != null
          }
          className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "post" ? "Posting…" : "Post now"}
        </button>
      </div>

      {busy === "load" ? (
        <div className="mt-4 text-sm text-neutral-500">
          Loading social publishing settings…
        </div>
      ) : null}

      {state && settings ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {state.providers.map((provider) => (
              <label
                key={provider.provider}
                className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
              >
                <input
                  type="checkbox"
                  checked={settings.providers.includes(
                    provider.provider,
                  )}
                  onChange={() =>
                    toggleProvider(provider.provider)
                  }
                  disabled={
                    !provider.configured || busy != null
                  }
                  className="mt-1"
                />
                <span className="min-w-0">
                  <strong className="block text-sm text-neutral-950">
                    {provider.label}
                  </strong>
                  <small className="block text-xs leading-5 text-neutral-500">
                    {provider.configured
                      ? provider.imageRequired
                        ? "Configured · challenge image required"
                        : "Configured"
                      : "Not configured"}
                  </small>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <label className="flex items-center gap-3 text-sm font-semibold text-neutral-900">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  disabled={
                    !state.schedulerConfigured || busy != null
                  }
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      enabled: event.target.checked,
                    })
                  }
                />
                Daily automatic posting
              </label>

              <button
                type="button"
                onClick={() => void save()}
                disabled={busy != null}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-40"
              >
                {busy === "save"
                  ? "Saving…"
                  : "Save automation"}
              </button>
            </div>

            {!state.schedulerConfigured ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Production scheduler secret is not configured yet.
                Manual posting still works after provider credentials
                are configured.
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs font-semibold text-neutral-700">
                Language
                <select
                  value={settings.locale}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      locale: event.target.value as
                        | "en"
                        | "fr"
                        | "ht",
                    })
                  }
                  className="min-h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
                >
                  <option value="en">English</option>
                  <option value="fr">French</option>
                  <option value="ht">Haitian Creole</option>
                </select>
              </label>

              <label className="grid gap-1 text-xs font-semibold text-neutral-700">
                Daily time
                <input
                  type="time"
                  value={settings.localTime}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      localTime: event.target.value,
                    })
                  }
                  className="min-h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
                />
              </label>

              <label className="grid gap-1 text-xs font-semibold text-neutral-700">
                Timezone
                <input
                  value={settings.timezone}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      timezone: event.target.value,
                    })
                  }
                  placeholder="America/Chicago"
                  className="min-h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
                />
              </label>
            </div>
          </div>

          {state.recentPosts.length ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-neutral-950">
                Recent social posts
              </h3>
              <div className="mt-2 divide-y divide-neutral-200 rounded-xl border border-neutral-200">
                {state.recentPosts.slice(0, 8).map((post) => (
                  <div
                    key={post.id}
                    className="grid gap-1 px-3 py-2 text-xs md:grid-cols-[90px_90px_minmax(0,1fr)_auto]"
                  >
                    <strong>{LABELS[post.provider]}</strong>
                    <span>{post.status}</span>
                    <span className="truncate text-neutral-600">
                      {post.challengeTitle}
                    </span>
                    <span className="text-neutral-500">
                      {post.dispatchDate}
                    </span>
                    {post.lastError ? (
                      <span className="text-red-700 md:col-span-4">
                        {post.lastError}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}
