import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AuthClientError,
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
      status: "authenticated";
      session: Extract<
        AppSessionResponse,
        { authenticated: true }
      >;
      error: null;
    }
  | {
      status: "unauthenticated";
      session: Extract<
        AppSessionResponse,
        { authenticated: false }
      >;
      error: null;
    }
  | {
      status: "error";
      session: null;
      error: {
        message: string;
        kind:
          | "http"
          | "network"
          | "invalid_json"
          | "invalid_payload";
        status?: number;
      };
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

        if (session.authenticated) {
          setState({
            status: "authenticated",
            session,
            error: null,
          });
          return;
        }

        setState({
          status: "unauthenticated",
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
            error instanceof AuthClientError
              ? {
                  message: error.message,
                  kind: error.kind,
                  status: error.status,
                }
              : {
                  message:
                    error instanceof Error
                      ? error.message
                      : "The session request failed.",
                  kind: "network",
                },
        });
      });

    return () => controller.abort();
  }, [client]);

  return state;
}
