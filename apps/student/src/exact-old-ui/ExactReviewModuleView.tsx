import {
  useEffect,
  useState,
} from "react";

import type {
  ReviewModule,
} from "@/lib/subjects/types";
import ReviewModulePageClient from "@student/features/learning/ReviewModulePageClient";

type PageData =
  | {
      status: "ready";
      mod: ReviewModule;
      canUnlockAll: boolean;
      catalogSlug: string | null;
    }
  | {
      status: "unavailable" | "missing";
      mod: null;
      canUnlockAll: boolean;
      catalogSlug: string | null;
    };

type State =
  | { status: "loading" }
  | { status: "ready"; data: PageData }
  | { status: "error"; error: string };

export function ExactReviewModuleView(props: {
  apiOrigin: string;
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  const [state, setState] = useState<State>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    const url = new URL(
      `/api/student-ui/review-modules/${encodeURIComponent(
        props.subjectSlug,
      )}/${encodeURIComponent(props.moduleSlug)}`,
      props.apiOrigin,
    );

    url.searchParams.set("locale", props.locale);

    void fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error ??
              `Review module request failed (${response.status}).`,
          );
        }

        return payload as PageData;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", data });
        }
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError"
        ) {
          return;
        }

        setState({
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Review module could not be loaded.",
        });
      });

    return () => controller.abort();
  }, [
    props.apiOrigin,
    props.locale,
    props.moduleSlug,
    props.subjectSlug,
  ]);

  if (state.status === "loading") {
    return (
      <div className="h-screen w-screen bg-[#0b0d12] text-white">
        <div className="grid h-full place-items-center">
          <div className="ui-surface-floating p-5">
            Loading lesson…
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="min-h-screen p-6 bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-white/90">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-lg font-black">
            Review module could not be loaded
          </div>
          <div className="mt-2 text-sm text-white/70">
            {state.error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ReviewModulePageClient
      canUnlockAll={
        state.data.canUnlockAll
      }
      mod={state.data.mod}
      pageStatus={state.data.status}
    />
  );
}
