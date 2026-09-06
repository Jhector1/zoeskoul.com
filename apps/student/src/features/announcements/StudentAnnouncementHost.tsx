import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useTranslations,
} from "../../compat/next-intl";
import {
  loadUnreadStudentAnnouncements,
  markStudentAnnouncementRead,
  type StudentAnnouncement,
} from "./studentAnnouncementsClient";

export function StudentAnnouncementHost(
  props: {
    apiOrigin: string;
    locale: string;
  },
) {
  const t =
    useTranslations(
      "Learning.announcements",
    );
  const [items, setItems] =
    useState<StudentAnnouncement[]>([]);
  const [busy, setBusy] =
    useState(false);

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

  useEffect(() => {
    let active = true;

    void loadUnreadStudentAnnouncements(
      props.apiOrigin,
    )
      .then((result) => {
        if (active) {
          setItems(
            result.announcements,
          );
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
        }
      });

    return () => {
      active = false;
    };
  }, [props.apiOrigin]);

  const current = items[0];

  if (!current) {
    return null;
  }

  function later() {
    setItems((previous) =>
      previous.slice(1),
    );
  }

  async function markRead() {
    setBusy(true);

    try {
      await markStudentAnnouncementRead(
        props.apiOrigin,
        current.id,
      );
      setItems((previous) =>
        previous.filter(
          (item) =>
            item.id !== current.id,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      role="region"
      aria-live="polite"
      aria-label={t("ariaLabel")}
      className="ui-surface-floating fixed bottom-4 right-4 z-[170] w-[calc(100%-2rem)] max-w-md rounded-2xl p-5 sm:bottom-6 sm:right-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="ui-section-kicker">
            {t(
              `scope.${current.scope}`,
            )}
          </div>
          <h2 className="mt-1 text-lg font-semibold">
            {current.title}
          </h2>
        </div>
        <span className="ui-pill-neutral rounded-full px-2.5 py-1 text-xs">
          {t("count", {
            current: 1,
            total: items.length,
          })}
        </span>
      </div>

      <div className="mt-2 text-xs opacity-60">
        {t("source", {
          source:
            current.sourceName,
          date: formatter.format(
            new Date(
              current.publishedAt,
            ),
          ),
        })}
      </div>

      <p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-line text-sm leading-6 opacity-85">
        {current.body}
      </p>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          className="ui-btn-secondary"
          onClick={later}
        >
          {t("actions.later")}
        </button>
        <button
          type="button"
          disabled={busy}
          className="ui-btn-primary"
          onClick={() =>
            void markRead()
          }
        >
          {t(
            busy
              ? "actions.marking"
              : "actions.markRead",
          )}
        </button>
      </div>
    </aside>
  );
}
