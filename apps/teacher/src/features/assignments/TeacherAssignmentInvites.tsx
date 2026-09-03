import {
  ApiClientError,
} from "@zoeskoul/api-client";
import {
  useMemo,
  useState,
} from "react";

import {
  useTranslations,
} from "../../compat/next-intl";
import {
  createTeacherAssignmentsClient,
  type TeacherAssignmentInvite,
} from "./teacherAssignmentsClient";

type SupportedLocale =
  | "en"
  | "es"
  | "fr"
  | "ht";

function normalizedLocale(
  locale: string,
): SupportedLocale {
  if (
    locale === "es" ||
    locale === "fr" ||
    locale === "ht"
  ) {
    return locale;
  }

  return "en";
}

export function TeacherAssignmentInvites(props: {
  apiOrigin: string;
  assignmentId: string;
  locale: string;
  invites: TeacherAssignmentInvite[];
  enabled: boolean;
  onNotice: (
    message: string | null,
  ) => void;
  onError: (
    message: string | null,
  ) => void;
  onInviteChanged: (
    email: string,
    patch: {
      expiresAt?: string;
      sentAt?: string | null;
    },
  ) => void;
}) {
  const t =
    useTranslations(
      "Teacher.assignments.invites",
    );
  const client =
    useMemo(
      () =>
        createTeacherAssignmentsClient({
          apiOrigin:
            props.apiOrigin,
        }),
      [props.apiOrigin],
    );
  const [busyEmail, setBusyEmail] =
    useState<string | null>(null);

  const pending =
    props.invites.filter(
      (invite) =>
        !invite.acceptedAt &&
        !invite.revokedAt,
    );

  if (!pending.length) {
    return null;
  }

  async function deliver(
    email: string,
    action: "link" | "email",
  ) {
    setBusyEmail(email);
    props.onError(null);
    props.onNotice(null);

    try {
      const result =
        await client.deliverInvite(
          props.assignmentId,
          {
            email,
            action,
            locale:
              normalizedLocale(
                props.locale,
              ),
          },
        );

      if (action === "link") {
        await navigator.clipboard.writeText(
          result.inviteUrl,
        );
        props.onInviteChanged(
          email,
          {
            expiresAt:
              result.expiresAt,
          },
        );
        props.onNotice(
          t("linkCopied", {
            email,
          }),
        );
      } else {
        props.onInviteChanged(
          email,
          {
            expiresAt:
              result.expiresAt,
            sentAt:
              result.delivery ===
              "email"
                ? result.sentAt
                : null,
          },
        );
        props.onNotice(
          t("emailSent", {
            email,
          }),
        );
      }
    } catch (cause) {
      if (
        cause instanceof
          ApiClientError &&
        cause.payload &&
        typeof cause.payload ===
          "object" &&
        "inviteUrl" in
          cause.payload &&
        typeof cause.payload
          .inviteUrl ===
          "string"
      ) {
        try {
          await navigator.clipboard.writeText(
            cause.payload
              .inviteUrl,
          );
          props.onError(
            t(
              "emailFailedCopied",
              { email },
            ),
          );
        } catch {
          props.onError(
            t(
              "deliveryFailed",
              { email },
            ),
          );
        }
      } else {
        props.onError(
          t(
            "deliveryFailed",
            { email },
          ),
        );
      }
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 lg:col-span-2">
      <div>
        <h2 className="font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          {t("description")}
        </p>
      </div>

      {!props.enabled ? (
        <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
          {t("disabled")}
        </div>
      ) : null}

      <div className="grid gap-2">
        {pending.map(
          (invite) => {
            const busy =
              busyEmail ===
              invite.email;

            return (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-3"
              >
                <div>
                  <div className="text-sm font-medium">
                    {invite.email}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {invite.sentAt
                      ? t(
                          "sent",
                          {
                            date:
                              new Date(
                                invite.sentAt,
                              ).toLocaleString(
                                props.locale,
                              ),
                          },
                        )
                      : t("notSent")}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !props.enabled
                    }
                    onClick={() => {
                      void deliver(
                        invite.email,
                        "link",
                      );
                    }}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    {t("copyLink")}
                  </button>

                  <button
                    type="button"
                    disabled={
                      busy ||
                      !props.enabled
                    }
                    onClick={() => {
                      void deliver(
                        invite.email,
                        "email",
                      );
                    }}
                    className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {busy
                      ? t("sending")
                      : invite.sentAt
                        ? t(
                            "resendEmail",
                          )
                        : t(
                            "sendEmail",
                          )}
                  </button>
                </div>
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}
