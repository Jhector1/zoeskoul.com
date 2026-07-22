export type ApiErrorBody = { error: string };

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected JSON object body");
  }
  return value as JsonObject;
}

export function requiredString(body: JsonObject, key: string) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

export function parseDraftQuery(searchParams: URLSearchParams) {
  const get = (key: string) => {
    const value = searchParams.get(key);
    if (!value) throw new Error(`${key} is required`);
    return value;
  };

  return {
    catalog: get("catalog"),
    subject: get("subject"),
    module: get("module"),
    topic: get("topic"),
    locale: searchParams.get("locale") || "en",
  };
}

export async function parseJsonBody(request: Request) {
  return asObject(await request.json());
}

export function parseSaveBundleBody(body: unknown) {
  const object = asObject(body);
  return {
    catalog: requiredString(object, "catalog"),
    subject: requiredString(object, "subject"),
    module: requiredString(object, "module"),
    topic: requiredString(object, "topic"),
    locale: typeof object.locale === "string" ? object.locale : "en",
    bundleJson: object.bundleJson,
  };
}

export function parseSaveMessagesBody(body: unknown) {
  const object = asObject(body);
  return {
    catalog: requiredString(object, "catalog"),
    subject: requiredString(object, "subject"),
    module: requiredString(object, "module"),
    topic: requiredString(object, "topic"),
    locale: typeof object.locale === "string" ? object.locale : "en",
    messagesJson: object.messagesJson,
  };
}

export function parseMessageKeyBody(body: unknown) {
  const object = asObject(body);
  return {
    catalog: requiredString(object, "catalog"),
    subject: requiredString(object, "subject"),
    module: requiredString(object, "module"),
    topic: requiredString(object, "topic"),
    locale: typeof object.locale === "string" ? object.locale : "en",
    keyPath: requiredString(object, "keyPath"),
    value: object.value,
  };
}

export function parseBackupBody(body: unknown) {
  const object = asObject(body);
  return {
    catalog: requiredString(object, "catalog"),
    subject: requiredString(object, "subject"),
    locale: typeof object.locale === "string" ? object.locale : "en",
  };
}

export function parseCommandBody(body: unknown) {
  const object = asObject(body);
  return {
    command: requiredString(object, "command"),
    catalog: typeof object.catalog === "string" ? object.catalog : undefined,
    subject: typeof object.subject === "string" ? object.subject : undefined,
    resume: object.resume === true,
  };
}
