import { ApiClientError } from "@zoeskoul/api-client";
import { useMemo, useState } from "react";

import { useTranslations } from "../../compat/next-intl";
import {
  createTeacherSchoolClient,
  type SchoolDetail,
} from "./teacherSchoolClient";

export function TeacherStaffClassAssignments(props: {
  apiOrigin: string;
  schoolId: string;
  staffUserId: string;
  classes: SchoolDetail["groups"];
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("Teacher.school.staffClasses");
  const client = useMemo(
    () => createTeacherSchoolClient({ apiOrigin: props.apiOrigin }),
    [props.apiOrigin],
  );
  const [busyClassId, setBusyClassId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!props.classes.length) {
    return <p className="mt-3 text-xs text-neutral-500">{t("empty")}</p>;
  }

  return (
    <div className="mt-4 border-t ui-border-soft pt-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t("title")}
      </div>
      <p className="mt-1 text-xs text-neutral-500">{t("description")}</p>

      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>
      ) : null}

      <div className="mt-3 grid gap-2">
        {props.classes.map((group) => {
          const assigned = group.instructorUserIds.includes(props.staffUserId);
          const busy = busyClassId === group.id;

          return (
            <label
              key={group.id}
              className="ui-surface flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{group.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-neutral-500">
                  {t(assigned ? "assigned" : "notAssigned")}
                </span>
                <input
                  type="checkbox"
                  checked={assigned}
                  disabled={busyClassId !== null}
                  aria-label={t("toggle", { className: group.name })}
                  onChange={() => {
                    setBusyClassId(group.id);
                    setError(null);
                    void client
                      .updateClassInstructor(props.schoolId, {
                        action: assigned ? "remove" : "assign",
                        groupId: group.id,
                        userId: props.staffUserId,
                      })
                      .then(() => props.onChanged())
                      .catch((cause) => {
                        setError(
                          cause instanceof ApiClientError
                            ? ((cause.payload as { error?: string } | undefined)?.error ??
                              t("error"))
                            : t("error"),
                        );
                      })
                      .finally(() => setBusyClassId(null));
                  }}
                />
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
