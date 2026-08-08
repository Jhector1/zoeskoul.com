import {
  useEffect,
  useState,
} from "react";
import {
  buildAuthenticateUrl,
} from "@zoeskoul/auth-client";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@zoeskoul/app-config";
import SubjectCardGrid from "@student/features/practice/ui/subject-picker/SubjectCardGrid";
import {
  useSubjectCardController,
} from "@student/features/practice/ui/subject-picker/useSubjectCardController";
import type {
  SubjectCard,
} from "@student/features/practice/ui/subject-picker/subjectCardTypes";

type Catalog = {
  slug: string;
  title: string;
  description: string;
  subjects: SubjectCard[];
};

function CatalogGrid(props: {
  initialSubjects: SubjectCard[];
  authenticated: boolean;
  websiteOrigin: string;
  locale: string;
}) {
  const {
    subjects,
    enrollingSlug,
    pickSubject,
  } = useSubjectCardController({
    initialSubjects: props.initialSubjects,
    allowEnrollment: props.authenticated,
  });

  const onPick = (subject: SubjectCard) => {
    if (props.authenticated) {
      void pickSubject(subject);
      return;
    }

    window.location.assign(
      buildAuthenticateUrl({
        websiteOrigin: props.websiteOrigin,
        callbackUrl: window.location.href,
        locale: props.locale,
      }),
    );
  };

  return (
    <SubjectCardGrid
      subjects={subjects}
      onPick={onPick}
      enrollingSlug={enrollingSlug}
    />
  );
}

export function ExactCatalogDetailView(props: {
  apiOrigin: string;
  websiteOrigin: string;
  locale: string;
  authenticated: boolean;
  catalogSlug: string;
}) {
  const [catalog, setCatalog] =
    useState<Catalog | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null);
    setError(null);

    void fetch(
      new URL(
        `/api/student-ui/catalogs/${encodeURIComponent(
          props.catalogSlug,
        )}`,
        props.apiOrigin,
      ),
      {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const payload = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error ??
              `Catalog request failed (${response.status}).`,
          );
        }

        return payload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setCatalog(payload.catalog ?? null);
        }
      })
      .catch((cause) => {
        if (
          !controller.signal.aborted &&
          cause?.name !== "AbortError"
        ) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Catalog could not be loaded.",
          );
        }
      });

    return () => controller.abort();
  }, [props.apiOrigin, props.catalogSlug]);

  if (!catalog) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white/90">
        <div className="ui-container py-6 sm:py-8 lg:py-10">
          <section
            className="ui-page-surface p-5 sm:p-6"
            aria-busy={!error}
          >
            <div className="ui-kicker">
              {props.catalogSlug}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {error
                ? "Catalog could not be loaded"
                : "Loading catalog"}
            </h1>
            {error ? (
              <p className="mt-3 ui-meta">{error}</p>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  const subjects = catalog.subjects;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white/90">
      <div className="ui-container py-6 sm:py-8 lg:py-10">
        <div className="grid gap-4">
          <section className="ui-page-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={ROUTES.catalogs}
                className="ui-btn-secondary px-3"
              >
                Back to catalogs
              </Link>
              <Link
                href={ROUTES.myLearning}
                className="ui-btn-secondary px-3"
              >
                My Learning
              </Link>
              <div className="ui-kicker">
                {catalog.slug}
              </div>
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {catalog.title}
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70">
              {catalog.description}
            </p>

            <div className="mt-4 inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-white/[0.06] dark:text-white/75">
              Choosing a course here enrolls the user automatically.
            </div>
          </section>

          <CatalogGrid
            initialSubjects={subjects}
            authenticated={props.authenticated}
            websiteOrigin={props.websiteOrigin}
            locale={props.locale}
          />
        </div>
      </div>
    </div>
  );
}
