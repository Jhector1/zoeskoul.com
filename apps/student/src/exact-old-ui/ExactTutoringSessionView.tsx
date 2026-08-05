import { buildAuthenticateUrl } from "@zoeskoul/auth-client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import TutoringSessionPlayer from "@/components/tutoring/TutoringSessionPlayer";
import type { TutoringWorkspaceParticipant } from "@/components/tutoring/TutoringWorkspaceBar";
import type { ReviewModule } from "@/lib/subjects/types";

type TutoringPayload = {
  status: "ready";
  session: {
    id: string;
    title: string;
    status: "draft" | "live" | "shared" | "archived";
  };
  snapshot: {
    subjectSlug: string;
  };
  selected: {
    sessionModuleSlug: string;
    module: ReviewModule;
  };
  canEditOwnProgress: boolean;
  canManage: boolean;
  canEditMasterWorkspace: boolean;
  publishedVersion: number;
  publishedAt: string | null;
  participants: TutoringWorkspaceParticipant[];
};

export function ExactTutoringSessionView(props: {
  websiteOrigin: string;
  locale: string;
  sessionId: string;
  subjectSlug?: string;
  moduleSlug?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<TutoringPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setError(null);
      const query = new URLSearchParams();
      if (props.moduleSlug) query.set("moduleSlug", props.moduleSlug);

      try {
        const response = await fetch(
          `/api/student-ui/tutoring-sessions/${encodeURIComponent(props.sessionId)}${
            query.toString() ? `?${query.toString()}` : ""
          }`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await response.json().catch(() => null);

        if (response.status === 401) {
          window.location.replace(
            buildAuthenticateUrl({
              websiteOrigin: props.websiteOrigin,
              callbackUrl: window.location.href,
            }),
          );
          return;
        }

        if (!response.ok || payload?.status !== "ready") {
          throw new Error(payload?.message ?? "This tutoring session is unavailable.");
        }

        if (
          props.subjectSlug &&
          props.subjectSlug !== payload.snapshot.subjectSlug
        ) {
          router.replace(`/${props.locale}/tutoring-sessions`);
          return;
        }

        if (!props.moduleSlug) {
          const suffix = searchParams.toString();
          router.replace(
            `/${props.locale}/tutoring-sessions/${encodeURIComponent(
              props.sessionId,
            )}/subjects/${encodeURIComponent(
              payload.snapshot.subjectSlug,
            )}/modules/${encodeURIComponent(
              payload.selected.sessionModuleSlug,
            )}/learn${suffix ? `?${suffix}` : ""}`,
          );
          return;
        }

        setData(payload);
      } catch (cause) {
        if ((cause as Error)?.name !== "AbortError") {
          setError(
            cause instanceof Error
              ? cause.message
              : "This tutoring session is unavailable.",
          );
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [
    props.locale,
    props.moduleSlug,
    props.sessionId,
    props.subjectSlug,
    props.websiteOrigin,
    router,
    searchParams,
  ]);

  if (!data) {
    return (
      <main className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white">
        <div className="ui-container py-8">
          <section className="ui-page-surface p-6">
            <div className="ui-kicker">Tutoring session</div>
            <h1 className="mt-2 ui-title-md">
              {error ?? "Opening the shared workspace…"}
            </h1>
            {error ? (
              <button
                className="ui-btn-secondary mt-4"
                type="button"
                onClick={() => router.replace(`/${props.locale}/tutoring-sessions`)}
              >
                Back to tutoring sessions
              </button>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  const workspace = searchParams.get("workspace");
  const initialWorkspaceView =
    workspace === "master" ||
    workspace === "reference" ||
    workspace === "mine" ||
    workspace === "learner"
      ? workspace
      : null;

  return (
    <TutoringSessionPlayer
      mod={data.selected.module}
      routePrefix={`/${props.locale}/tutoring-sessions/${encodeURIComponent(
        props.sessionId,
      )}`}
      moduleKey={data.selected.sessionModuleSlug}
      session={{
        id: props.sessionId,
        title: data.session.title,
        status: data.session.status,
        canManage: data.canManage,
        canEditOwnProgress: data.canEditOwnProgress,
        canEditMasterWorkspace: data.canEditMasterWorkspace,
        publishedVersion: data.publishedVersion,
        publishedAt: data.publishedAt,
        participants: data.participants,
      }}
      initialWorkspaceView={initialWorkspaceView}
      initialLearnerId={searchParams.get("learnerId")}
    />
  );
}
