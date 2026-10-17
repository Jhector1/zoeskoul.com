import {
  supportedLocales,
} from "@zoeskoul/app-config";

import {
  headers,
} from "next/headers";

import {
  redirect,
} from "next/navigation";

function firstString(
  value:
    string |
    string[] |
    undefined,
) {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value[0] ??
      null;
  }

  return null;
}

function preferredLocale(
  acceptLanguage:
    string |
    null,
) {
  const supported =
    Array.from(
      supportedLocales,
    );

  const fallback =
    supported[0];

  if (!fallback) {
    throw new Error(
      "ZoeBuild has no supported locale configured.",
    );
  }

  if (!acceptLanguage) {
    return fallback;
  }

  const candidates =
    acceptLanguage
      .split(",")
      .map(
        (
          part,
        ) =>
          part
            .trim()
            .split(";")[0]
            ?.trim()
            .toLowerCase() ??
          "",
      )
      .filter(
        Boolean,
      );

  for (
    const candidate of
    candidates
  ) {
    const exact =
      supported.find(
        (
          locale,
        ) =>
          locale.toLowerCase() ===
          candidate,
      );

    if (exact) {
      return exact;
    }

    const language =
      candidate.split(
        "-",
      )[0];

    const languageMatch =
      supported.find(
        (
          locale,
        ) =>
          locale
            .toLowerCase()
            .split("-")[0] ===
          language,
      );

    if (languageMatch) {
      return languageMatch;
    }
  }

  return fallback;
}

function safeOrderId(
  value:
    string |
    null,
) {
  if (
    !value ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(
      value,
    )
  ) {
    return null;
  }

  return value;
}

export default async function ZoeBuildProjectReturnGateway(
  props: {
    params:
      Promise<{
        buildProjectId:
          string;
      }>;

    searchParams:
      Promise<
        Record<
          string,
          string |
          string[] |
          undefined
        >
      >;
  },
) {
  const [
    params,
    query,
    requestHeaders,
  ] =
    await Promise.all([
      props.params,
      props.searchParams,
      headers(),
    ]);

  const buildProjectId =
    params
      .buildProjectId
      .trim();

  if (
    !/^[A-Za-z0-9_-]{1,160}$/.test(
      buildProjectId,
    )
  ) {
    redirect(
      "/projects",
    );
  }

  const locale =
    preferredLocale(
      requestHeaders.get(
        "accept-language",
      ),
    );

  const targetQuery =
    new URLSearchParams();

  const checkout =
    firstString(
      query.checkout,
    );

  if (
    checkout ===
      "success" ||
    checkout ===
      "cancel"
  ) {
    targetQuery.set(
      "checkout",
      checkout,
    );
  }

  const orderId =
    safeOrderId(
      firstString(
        query.orderId,
      ),
    );

  if (orderId) {
    targetQuery.set(
      "orderId",
      orderId,
    );
  }

  const suffix =
    targetQuery.size
      ? `?${targetQuery.toString()}`
      : "";

  redirect(
    `/${encodeURIComponent(
      locale,
    )}/projects/${encodeURIComponent(
      buildProjectId,
    )}${suffix}`,
  );
}
