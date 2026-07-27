import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createAuthClient,
  type AppSessionResponse,
} from "./index.js";

export type AppSessionLoadState =
  | {
      status: "loading";
      session: null;
      error: null;
    }
  | {
      status: "ready";
      session: AppSessionResponse;
      error: null;
    }
  | {
      status: "error";
      session: null;
      error: string;
    };

export function useAppSession(args: {
  apiOrigin: string;
}): AppSessionLoadState {
  const client = useMemo(
    () => createAuthClient({ apiOrigin: args.apiOrigin }),
    [args.apiOrigin],
  );

  const [state, setState] = useState<AppSessionLoadState>({
    status: "loading",
    session: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState({
      status: "loading",
      session: null,
      error: null,
    });

    void client
      .fetchSession(controller.signal)
      .then((session) => {
        if (controller.signal.aborted) return;

        setState({
          status: "ready",
          session,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setState({
          status: "error",
          session: null,
          error:
            error instanceof Error
              ? error.message
              : "The session request failed.",
        });
      });

    return () => controller.abort();
  }, [client]);

  return state;
}
