import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createLearningClient,
  type MyLearningResponse,
} from "./index.js";

export type MyLearningLoadState =
  | {
      status: "loading";
      data: null;
      error: null;
    }
  | {
      status: "ready";
      data: MyLearningResponse;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };

export function useMyLearning(args: {
  apiOrigin: string;
  locale?: string;
}): MyLearningLoadState {
  const client = useMemo(
    () => createLearningClient({
      apiOrigin: args.apiOrigin,
    }),
    [args.apiOrigin],
  );

  const [state, setState] = useState<MyLearningLoadState>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState({
      status: "loading",
      data: null,
      error: null,
    });

    void client
      .fetchMyLearning({
        locale: args.locale,
        signal: controller.signal,
      })
      .then((data) => {
        if (controller.signal.aborted) return;

        setState({
          status: "ready",
          data,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setState({
          status: "error",
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "My Learning could not be loaded.",
        });
      });

    return () => controller.abort();
  }, [
    args.locale,
    client,
  ]);

  return state;
}
