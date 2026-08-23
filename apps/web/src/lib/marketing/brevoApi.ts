import "server-only";

const BREVO_API_BASE = "https://api.brevo.com/v3";
const DEFAULT_TIMEOUT_MS = 10_000;

export type BrevoApiEnvironment = {
  BREVO_API_KEY?: string;
  BREVO_MARKETING_LIST_ID?: string;
  BREVO_FROM_EMAIL?: string;
  BREVO_FROM_NAME?: string;
};

export type BrevoApiRequestOptions = {
  env?: BrevoApiEnvironment;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export class BrevoConfigurationError extends Error {
  constructor(message = "Brevo is not configured.") {
    super(message);
    this.name = "BrevoConfigurationError";
  }
}

export class BrevoApiError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail || `Brevo request failed with HTTP ${status}.`);
    this.name = "BrevoApiError";
    this.status = status;
  }
}

export async function readBrevoErrorDetail(
  response: Response,
): Promise<string> {
  const text = (await response.text()).trim();
  if (!text) {
    return `Brevo request failed with HTTP ${response.status}.`;
  }

  try {
    const parsed = JSON.parse(text) as {
      message?: unknown;
      code?: unknown;
      error?: unknown;
    };
    const message =
      typeof parsed.message === "string"
        ? parsed.message.trim()
        : typeof parsed.error === "string"
          ? parsed.error.trim()
          : "";
    const code =
      typeof parsed.code === "string" ? parsed.code.trim() : "";

    return [code, message].filter(Boolean).join(": ").slice(0, 700) ||
      text.slice(0, 700);
  } catch {
    return text.slice(0, 700);
  }
}

function environment(
  env?: BrevoApiEnvironment,
): BrevoApiEnvironment {
  return env ?? (process.env as BrevoApiEnvironment);
}

export function normalizeBrevoEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidBrevoEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(normalizeBrevoEmail(value));
}

export function hasBrevoApiKey(env?: BrevoApiEnvironment) {
  return Boolean(environment(env).BREVO_API_KEY?.trim());
}

export function getBrevoDefaultMarketingListId(
  env?: BrevoApiEnvironment,
): number | null {
  const raw = environment(env).BREVO_MARKETING_LIST_ID?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function getBrevoCampaignSender(
  env?: BrevoApiEnvironment,
): { email: string; name: string } | null {
  const source = environment(env);
  const raw = source.BREVO_FROM_EMAIL?.trim();
  if (!raw) return null;

  const mailbox = raw.match(
    /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/,
  );
  const email = normalizeBrevoEmail(mailbox?.[2] ?? raw);
  if (!isValidBrevoEmail(email)) return null;

  const mailboxName = mailbox?.[1]?.trim().replace(/^["']|["']$/g, "");
  const name =
    source.BREVO_FROM_NAME?.trim() ||
    mailboxName ||
    "ZoeSkoul";

  return { email, name };
}

export async function brevoApiFetch(
  path: string,
  init: RequestInit = {},
  options: BrevoApiRequestOptions = {},
): Promise<Response> {
  const apiKey = environment(options.env).BREVO_API_KEY?.trim();
  if (!apiKey) {
    throw new BrevoConfigurationError(
      "BREVO_API_KEY is not configured.",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    return await fetchImpl(`${BREVO_API_BASE}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        ...(init.body != null
          ? { "content-type": "application/json" }
          : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function brevoApiJson<T>(
  path: string,
  init: RequestInit = {},
  options: BrevoApiRequestOptions = {},
): Promise<T> {
  const response = await brevoApiFetch(path, init, options);

  if (!response.ok) {
    throw new BrevoApiError(
      response.status,
      await readBrevoErrorDetail(response),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
