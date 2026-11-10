import { buildRunnerHeaders } from "@zoeskoul/curriculum-runtime";

function getRunnerBaseUrl() {
  const base =
    process.env.RUNNER_BASE_URL?.trim();
  if (!base) {
    throw new Error("Missing RUNNER_BASE_URL");
  }

  const normalized = base.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error(
      "RUNNER_BASE_URL must start with http:// or https://",
    );
  }

  return normalized;
}

export class RunnerHttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    if (code && /^[A-Z][A-Z0-9_]{2,96}$/.test(code)) this.code = code;
  }
}

export async function runnerPost<T>(
  path: string,
  actorKey: string,
  body?: unknown,
): Promise<T> {
  const url = `${getRunnerBaseUrl()}${path}`;

  let res: Response;

  try {
    res = await fetch(url, {
      method: "POST",
      headers: buildRunnerHeaders({ actorKey }),
      body: body == null ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error: any) {
    const cause = error?.cause?.message ? `: ${error.cause.message}` : "";
    throw new Error(`Runner fetch failed for ${path}${cause}`);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new RunnerHttpError(
      res.status,
      (data as any)?.error ?? `Runner error: ${res.status}`,
      typeof (data as any)?.code === "string" ? (data as any).code : undefined,
    );
  }

  return data as T;
}
