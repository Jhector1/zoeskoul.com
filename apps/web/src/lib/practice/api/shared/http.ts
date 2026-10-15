import { attachGuestCookie } from "@/lib/practice/actor";

export {
  bodyJsonResponse,
  enforceSameOriginPost,
  exceedsContentLength,
  getClientIp,
  getContentLength,
  hardenApiResponse,
  jsonApiResponse,
  readJsonSafe,
  safeSameOriginUrl,
} from "@zoeskoul/platform-server/http";

import {
  bodyJsonResponse,
  jsonApiResponse,
} from "@zoeskoul/platform-server/http";

export function bodyJsonWithGuestCookie<T>(
  body: T,
  status = 200,
  setGuestId?: string | null,
) {
  const res = bodyJsonResponse(body, status);
  return attachGuestCookie(res, setGuestId ?? undefined);
}

export function jsonApiWithGuestCookie(args: {
  requestId: string;
  message: string;
  status: number;
  setGuestId?: string | null;
  extra?: Record<string, unknown>;
}) {
  const res = jsonApiResponse({
    requestId: args.requestId,
    message: args.message,
    status: args.status,
    extra: args.extra,
  });

  return attachGuestCookie(res, args.setGuestId ?? undefined);
}
