import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useTranslations,
} from "../../compat/next-intl";
import {
  createTeacherAnnouncementsClient,
  type TeacherAnnouncement,
  type TeacherAnnouncementScope,
} from "./teacherAnnouncementsClient";

export function TeacherAnnouncementsPanel(
  props: {
    apiOrigin: string;
    locale: string;
    scope: TeacherAnnouncementScope;
    targetId: string;
    canPublish: boolean;
  },
) {
  const t =
    useTranslations(
      "Teacher.announcements",
    );
  const client = useMemo(
    () =>
      createTeacherAnnouncementsClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );
  const [items, setItems] =
    useState<TeacherAnnouncement[]>([]);
  const [title, setTitle] =
    useState("");
  const [body, setBody] =
    useState("");
  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        props.locale,
        {
          dateStyle: "medium",
          timeStyle: "short",
        },
      ),
    [props.locale],
  );

  async function load() {
    const result =
      await client.list(
        props.scope,
        props.targetId,
      );
    setItems(result.announcements);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void client
      .list(
        props.scope,
        props.targetId,
      )
      .then((result) => {
        if (!active) return;
        setItems(
          result.announcements,
        );
      })
      .catch(() => {
        if (!active) return;
        setError(t("errors.load"));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    client,
    props.scope,
    props.targetId,
    t,
  ]);

  async function publish() {
    if (
      !title.trim() ||
      !body.trim()
    ) {
      setError(
        t("errors.required"),
      );
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await client.publish(
        props.scope,
        props.targetId,
        {
          title: title.trim(),
          body: body.trim(),
        },
      );
      setTitle("");
      setBody("");
      await load();
      setNotice(
        t("notices.published"),
      );
    } catch {
      setError(
        t("errors.publish"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ui-surface rounded-2xl p-5">
      <div>
        <div className="ui-section-kicker">
          {t("kicker")}
        </div>
        <h2 className="mt-1 text-xl font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm opacity-70">
          {t("description", {
            scope: t(
              `scope.${props.scope}`,
            ),
          })}
        </p>
      </div>

      {error ? (
        <div className="ui-surface-danger mt-4 rounded-xl p-3 text-sm">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="ui-surface-soft mt-4 rounded-xl p-3 text-sm">
          {notice}
        </div>
      ) : null}

      {props.canPublish ? (
        <div className="ui-surface-soft mt-4 rounded-xl p-4">
          <div className="grid gap-3">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">
                {t("fields.title")}
              </span>
              <input
                value={title}
                maxLength={120}
                onChange={(event) =>
                  setTitle(
                    event.target.value,
                  )
                }
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium">
                {t("fields.body")}
              </span>
              <textarea
                value={body}
                maxLength={4000}
                onChange={(event) =>
                  setBody(
                    event.target.value,
                  )
                }
                className="min-h-28 rounded-lg border px-3 py-2"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={busy}
            className="ui-btn-primary mt-3"
            onClick={() =>
              void publish()
            }
          >
            {t(
              busy
                ? "actions.publishing"
                : "actions.publish",
            )}
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {loading ? (
          <p className="text-sm opacity-70">
            {t("loading")}
          </p>
        ) : items.length ? (
          items.map((item) => (
            <article
              key={item.id}
              className="ui-surface-soft rounded-xl p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {item.title}
                  </div>
                  <div className="mt-1 text-xs opacity-60">
                    {t("published", {
                      date: formatter.format(
                        new Date(
                          item.publishedAt,
                        ),
                      ),
                    })}
                  </div>
                </div>
                <span className="ui-pill-neutral rounded-full px-3 py-1 text-xs">
                  {t("meta", {
                    recipients:
                      item.recipientCount,
                    read: item.readCount,
                  })}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 opacity-80">
                {item.body}
              </p>
            </article>
          ))
        ) : (
          <p className="text-sm opacity-70">
            {t("empty")}
          </p>
        )}
      </div>
    </section>
  );
}
