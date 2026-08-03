import {
  buildLogoutUrl,
} from "@zoeskoul/auth-client";

export function buildStudentLogoutUrl(args: {
  websiteOrigin: string;
  locale: string;
}): string {
  return buildLogoutUrl(args);
}
