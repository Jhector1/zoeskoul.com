import type {
  AppRole,
  RoleCapabilities,
} from "@zoeskoul/permissions";

export type AppSessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  roles: AppRole[];
};

export type AppSessionResponse =
  | {
      authenticated: true;
      user: AppSessionUser;
      capabilities: RoleCapabilities;
    }
  | {
      authenticated: false;
      user: null;
      capabilities: RoleCapabilities;
    };

export type ApiErrorResponse = {
  error: string;
  code?: string;
  detail?: string;
  requestId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAppSessionResponse(
  value: unknown,
): value is AppSessionResponse {
  if (!isRecord(value)) return false;
  if (typeof value.authenticated !== "boolean") return false;
  if (!isRecord(value.capabilities)) return false;

  if (value.authenticated === false) {
    return value.user === null;
  }

  if (!isRecord(value.user)) return false;

  return (
    typeof value.user.id === "string" &&
    Array.isArray(value.user.roles) &&
    value.user.roles.every((role) => typeof role === "string")
  );
}
