import type {
  AppCapability,
  AppRole,
} from "@zoeskoul/permissions";
import {
  isAppCapability,
  isAppRole,
} from "@zoeskoul/permissions";

export type {
  AppCapability,
  AppRole,
} from "@zoeskoul/permissions";

export type AppSessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

export type AppSessionResponse =
  | {
      authenticated: true;
      user: AppSessionUser;
      roles: AppRole[];
      capabilities: AppCapability[];
    }
  | {
      authenticated: false;
      user: null;
      roles: [];
      capabilities: [];
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

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) =>
    keys.includes(key),
  );
}

function isNullableString(
  value: unknown,
): value is string | null {
  return value === null || typeof value === "string";
}

function hasOnlyArrayIndexKeys(
  value: unknown[],
): boolean {
  return Object.keys(value).every(
    (key, index) => key === String(index),
  );
}

function isAppRoleArray(
  value: unknown,
): value is AppRole[] {
  return (
    Array.isArray(value) &&
    hasOnlyArrayIndexKeys(value) &&
    value.every((role) => isAppRole(role))
  );
}

function isAppCapabilityArray(
  value: unknown,
): value is AppCapability[] {
  return (
    Array.isArray(value) &&
    hasOnlyArrayIndexKeys(value) &&
    value.every((capability) =>
      isAppCapability(capability),
    )
  );
}

export function isAppSessionResponse(
  value: unknown,
): value is AppSessionResponse {
  if (!isRecord(value)) return false;
  if (typeof value.authenticated !== "boolean") return false;
  if (!("roles" in value) || !("capabilities" in value)) {
    return false;
  }

  if (value.authenticated === false) {
    return (
      value.user === null &&
      isAppRoleArray(value.roles) &&
      value.roles.length === 0 &&
      isAppCapabilityArray(
        value.capabilities,
      ) &&
      value.capabilities.length === 0 &&
      hasOnlyKeys(value, [
        "authenticated",
        "user",
        "roles",
        "capabilities",
      ])
    );
  }

  if (!isRecord(value.user)) return false;
  if (
    !hasOnlyKeys(value, [
      "authenticated",
      "user",
      "roles",
      "capabilities",
    ])
  ) {
    return false;
  }

  return (
    hasOnlyKeys(value.user, [
      "id",
      "name",
      "email",
      "image",
    ]) &&
    typeof value.user.id === "string" &&
    isNullableString(value.user.name) &&
    isNullableString(value.user.email) &&
    isNullableString(value.user.image) &&
    isAppRoleArray(value.roles) &&
    isAppCapabilityArray(value.capabilities)
  );
}


export type PublicChallengeExercisePurpose = "practice";

export type PublicChallengeExerciseOption = {
  id: string;
  catalogSlug: string;
  catalogTitle: string;
  subjectSlug: string;
  subjectTitle: string;
  subjectTitleKey?: string | null;
  releaseStatus: "active" | "legacy";
  moduleSlug: string;
  moduleTitle: string;
  moduleTitleKey?: string | null;
  sectionSlug: string;
  sectionTitle: string;
  sectionTitleKey?: string | null;
  sectionRole: string;
  topicSlug: string;
  topicTitle: string;
  topicTitleKey?: string | null;
  exerciseKey: string;
  exerciseTitle: string;
  exerciseKind: string;
  exercisePurpose: PublicChallengeExercisePurpose;
  isMultiFile: boolean;
  requiresTerminal: boolean;
  isStandaloneTryIt: boolean;
};

export type PublicChallengePublisherAccess = {
  authenticated: boolean;
  allowed: boolean;
};

export type PublicChallengesAdminResponse = {
  access: PublicChallengePublisherAccess;
  options: PublicChallengeExerciseOption[];
  counts: {
    total: number;
    practice: number;
  };
};

export type PublicChallengeAudienceList = {
  id: number;
  name: string;
  folderId: number;
  totalSubscribers: number | null;
  isDefault: boolean;
};

export type PublicChallengeAudienceSuppressionReason =
  | "blacklisted"
  | "unsubscribed"
  | "invalid_email";

export type PublicChallengeAudienceContact = {
  email: string;
  name: string | null;
  selectable: boolean;
  suppressionReason: PublicChallengeAudienceSuppressionReason | null;
};

export type PublicChallengeAudienceListsResponse = {
  provider: "brevo";
  configured: boolean;
  defaultListId: number | null;
  lists: PublicChallengeAudienceList[];
};

export type PublicChallengeAudienceContactsResponse = {
  provider: "brevo";
  configured: true;
  list: PublicChallengeAudienceList;
  contacts: PublicChallengeAudienceContact[];
  counts: {
    total: number;
    selectable: number;
    suppressed: number;
  };
  truncated: boolean;
};

export type PublicChallengeEmailPreviewResponse = {
  ok: true;
  action: "preview";
  subject: string;
  previewText: string;
  html: string;
};

export type PublicChallengeEmailTestResponse = {
  ok: true;
  action: "test";
  campaignId: number;
  testEmail: string;
};

export type PublicChallengeEmailSendResponse = {
  ok: true;
  action: "send";
  campaignId: number;
  sourceListId: number;
  exclusionListId: number | null;
  selectedCount: number;
};

export type PublicChallengeEmailImageUploadResponse = {
  ok: true;
  imageUrl: string;
};
