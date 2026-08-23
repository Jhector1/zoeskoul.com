import { useEffect, useMemo, useState } from "react";

import { adminApi } from "@/lib/adminApi";

export type AdminResourceState<T> =
  | { kind: "loading"; data: null; message: null }
  | { kind: "ready"; data: T; message: null }
  | { kind: "error"; data: null; message: string };

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "The request could not be completed.";
}

export function useAdminResource<T>(
  apiOrigin: string,
  path: string,
): AdminResourceState<T> {
  const client = useMemo(
    () => adminApi(apiOrigin),
    [apiOrigin],
  );

  const [state, setState] = useState<AdminResourceState<T>>({
    kind: "loading",
    data: null,
    message: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState({
      kind: "loading",
      data: null,
      message: null,
    });

    void client
      .request<T>(path, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "ready",
          data,
          message: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          data: null,
          message: errorMessage(error),
        });
      });

    return () => controller.abort();
  }, [client, path]);

  return state;
}
