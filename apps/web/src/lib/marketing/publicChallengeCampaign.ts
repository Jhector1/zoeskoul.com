import "server-only";

import type {
  PublicChallengeAudienceContact,
  PublicChallengeAudienceContactsResponse,
  PublicChallengeAudienceList,
  PublicChallengeAudienceListsResponse,
  PublicChallengeEmailPreviewResponse,
  PublicChallengeEmailSendResponse,
  PublicChallengeEmailTestResponse,
} from "@zoeskoul/api-contracts";

import {
  BrevoApiError,
  BrevoConfigurationError,
  brevoApiFetch,
  brevoApiJson,
  getBrevoDefaultMarketingListId,
  hasBrevoApiKey,
  isValidBrevoEmail,
  normalizeBrevoEmail,
  readBrevoErrorDetail,
  type BrevoApiEnvironment,
  type BrevoApiRequestOptions,
} from "@/lib/marketing/brevoApi";

const LIST_PAGE_SIZE = 50;
const CONTACT_PAGE_SIZE = 500;
const MAX_LISTS = 500;
const MAX_CONTACTS = 5_000;
const EXCLUSION_ADD_CHUNK = 150;

type ChallengeCampaignOptions = BrevoApiRequestOptions;

type RawBrevoList = {
  id?: unknown;
  name?: unknown;
  folderId?: unknown;
  totalSubscribers?: unknown;
};

type RawBrevoContact = {
  email?: unknown;
  emailBlacklisted?: unknown;
  listUnsubscribed?: unknown;
  attributes?: unknown;
};

type RawBrevoListsPayload = {
  count?: unknown;
  lists?: unknown;
};

type RawBrevoContactsPayload = {
  count?: unknown;
  contacts?: unknown;
};

type RawBrevoSender = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  active?: unknown;
};

type RawBrevoSendersPayload = {
  senders?: unknown;
};

type ChallengeEmailContent = {
  title: string;
  description: string;
  challengeUrl: string;
  imageUrl?: string | null;
};

type CampaignCreateArgs = ChallengeEmailContent & {
  sourceListId: number;
  exclusionListId?: number | null;
  testLabel?: boolean;
};

function positiveInt(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function nonNegativeInt(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function nameFromAttributes(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== "object") return null;

  const values = attributes as Record<string, unknown>;
  const first =
    stringValue(values.FIRSTNAME) ||
    stringValue(values.FNAME) ||
    stringValue(values.FIRST_NAME);
  const last =
    stringValue(values.LASTNAME) ||
    stringValue(values.LNAME) ||
    stringValue(values.LAST_NAME);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || null;
}

function normalizeList(
  raw: RawBrevoList,
  defaultListId: number | null,
): PublicChallengeAudienceList | null {
  const id = positiveInt(raw.id);
  const folderId = positiveInt(raw.folderId);
  const name = stringValue(raw.name);
  if (!id || !folderId || !name) return null;

  return {
    id,
    name,
    folderId,
    totalSubscribers: nonNegativeInt(raw.totalSubscribers),
    isDefault: id === defaultListId,
  };
}

function normalizeContact(
  raw: RawBrevoContact,
  listId: number,
): PublicChallengeAudienceContact | null {
  const email = normalizeBrevoEmail(stringValue(raw.email));
  if (!email) return null;

  const unsubscribedIds = Array.isArray(raw.listUnsubscribed)
    ? raw.listUnsubscribed
        .map(positiveInt)
        .filter((value): value is number => value != null)
    : [];

  const suppressionReason =
    !isValidBrevoEmail(email)
      ? "invalid_email"
      : raw.emailBlacklisted === true
        ? "blacklisted"
        : unsubscribedIds.includes(listId)
          ? "unsubscribed"
          : null;

  return {
    email,
    name: nameFromAttributes(raw.attributes),
    selectable: suppressionReason == null,
    suppressionReason,
  };
}

export function publicChallengeBrevoConfigured(
  env?: BrevoApiEnvironment,
) {
  return hasBrevoApiKey(env);
}

export async function listPublicChallengeAudienceLists(
  options: ChallengeCampaignOptions = {},
): Promise<PublicChallengeAudienceListsResponse> {
  if (!publicChallengeBrevoConfigured(options.env)) {
    return {
      provider: "brevo",
      configured: false,
      defaultListId: getBrevoDefaultMarketingListId(options.env),
      lists: [],
    };
  }

  const defaultListId = getBrevoDefaultMarketingListId(options.env);
  const lists: PublicChallengeAudienceList[] = [];
  let offset = 0;
  let expectedCount: number | null = null;

  while (lists.length < MAX_LISTS) {
    const payload = await brevoApiJson<RawBrevoListsPayload>(
      `/contacts/lists?limit=${LIST_PAGE_SIZE}&offset=${offset}&sort=desc`,
      { method: "GET" },
      options,
    );

    const rawLists = Array.isArray(payload.lists)
      ? (payload.lists as RawBrevoList[])
      : [];
    expectedCount = nonNegativeInt(payload.count);

    for (const raw of rawLists) {
      const normalized = normalizeList(raw, defaultListId);
      if (normalized) lists.push(normalized);
      if (lists.length >= MAX_LISTS) break;
    }

    offset += rawLists.length;
    if (
      rawLists.length < LIST_PAGE_SIZE ||
      rawLists.length === 0 ||
      (expectedCount != null && offset >= expectedCount)
    ) {
      break;
    }
  }

  lists.sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    provider: "brevo",
    configured: true,
    defaultListId,
    lists,
  };
}

export async function getPublicChallengeAudienceList(
  listId: number,
  options: ChallengeCampaignOptions = {},
): Promise<PublicChallengeAudienceList> {
  if (!publicChallengeBrevoConfigured(options.env)) {
    throw new BrevoConfigurationError(
      "BREVO_API_KEY is not configured.",
    );
  }

  const payload = await brevoApiJson<RawBrevoList>(
    `/contacts/lists/${listId}`,
    { method: "GET" },
    options,
  );
  const normalized = normalizeList(
    payload,
    getBrevoDefaultMarketingListId(options.env),
  );

  if (!normalized) {
    throw new Error("Brevo returned an invalid audience list.");
  }

  return normalized;
}

export async function listPublicChallengeAudienceContacts(
  listId: number,
  options: ChallengeCampaignOptions = {},
): Promise<PublicChallengeAudienceContactsResponse> {
  const list = await getPublicChallengeAudienceList(listId, options);
  const contacts: PublicChallengeAudienceContact[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let total = 0;

  while (contacts.length < MAX_CONTACTS) {
    const payload = await brevoApiJson<RawBrevoContactsPayload>(
      `/contacts/lists/${listId}/contacts?limit=${CONTACT_PAGE_SIZE}&offset=${offset}&sort=asc`,
      { method: "GET" },
      options,
    );

    const rawContacts = Array.isArray(payload.contacts)
      ? (payload.contacts as RawBrevoContact[])
      : [];
    total = nonNegativeInt(payload.count) ?? Math.max(total, offset);

    for (const raw of rawContacts) {
      const normalized = normalizeContact(raw, listId);
      if (!normalized || seen.has(normalized.email)) continue;
      seen.add(normalized.email);
      contacts.push(normalized);
      if (contacts.length >= MAX_CONTACTS) break;
    }

    offset += rawContacts.length;
    if (
      rawContacts.length < CONTACT_PAGE_SIZE ||
      rawContacts.length === 0 ||
      offset >= total
    ) {
      break;
    }
  }

  contacts.sort((left, right) => {
    const leftKey = left.name || left.email;
    const rightKey = right.name || right.email;
    return leftKey.localeCompare(rightKey);
  });

  const selectable = contacts.filter((contact) => contact.selectable).length;

  return {
    provider: "brevo",
    configured: true,
    list,
    contacts,
    counts: {
      total,
      selectable,
      suppressed: Math.max(0, total - selectable),
    },
    truncated: total > contacts.length,
  };
}

const PUBLIC_CHALLENGE_SENDER_EMAIL = "challenges@zoeskoul.com";
const PUBLIC_CHALLENGE_SENDER_NAME = "ZoeSkoul Challenges";
const PUBLIC_CHALLENGE_REPLY_TO = "support@zoeskoul.com";
const PUBLIC_CHALLENGE_EMAIL_SUBJECT = "Your Daily ZoeSkoul Challenge is ready";

export function renderPublicChallengeCampaign(
  input: ChallengeEmailContent,
): PublicChallengeEmailPreviewResponse {
  const title = input.title.trim().slice(0, 120) || "ZoeSkoul challenge";
  const description = input.description.trim().slice(0, 600);
  const challengeUrl = safeHttpUrl(input.challengeUrl);
  const imageUrl = safeHttpUrl(input.imageUrl);

  if (!challengeUrl) {
    throw new Error("Challenge URL must be an HTTP or HTTPS URL.");
  }

  const subject = PUBLIC_CHALLENGE_EMAIL_SUBJECT;
  const previewText = (
    description ||
    "Put your skills to the test with a new hands-on ZoeSkoul challenge."
  ).slice(0, 180);

  const image = imageUrl
    ? `
            <tr>
              <td style="padding:0 32px 24px;">
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" width="576" style="display:block;width:100%;max-width:576px;height:auto;border:0;border-radius:12px;" />
              </td>
            </tr>`
    : "";

  const bodyCopy = description
    ? `<p style="margin:0;color:#4b5563;font-size:16px;line-height:1.7;">${escapeHtml(description)}</p>`
    : `<p style="margin:0;color:#4b5563;font-size:16px;line-height:1.7;">A new hands-on coding challenge is ready. See if you can solve it.</p>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f6f7f9;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
        <tr><td style="padding:28px 32px 18px;">
          <div style="font-size:22px;line-height:1;font-weight:800;letter-spacing:-0.03em;color:#111827;">ZoeSkoul</div>
          <div style="margin-top:8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#159447;">New challenge</div>
        </td></tr>
        ${image}
        <tr><td style="padding:8px 32px 32px;">
          <h1 style="margin:0 0 14px;font-size:30px;line-height:1.16;letter-spacing:-0.035em;color:#111827;">${escapeHtml(title)}</h1>
          ${bodyCopy}
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;"><tr>
            <td style="border-radius:9px;background:#159447;">
              <a href="${escapeHtml(challengeUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Try the challenge</a>
            </td>
          </tr></table>
          <p style="margin:18px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">No account is required to try it.</p>
        </td></tr>
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.6;">
          You’re receiving this because you subscribed to ZoeSkoul updates.
          <a href="{{ unsubscribe }}" style="color:#4b5563;text-decoration:underline;">Unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    ok: true,
    action: "preview",
    subject,
    previewText,
    html,
  };
}

function campaignName(title: string, testLabel = false) {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const prefix = testLabel ? "TEST · " : "";
  return `${prefix}ZoeSkoul challenge · ${title.trim().slice(0, 72)} · ${stamp}`;
}

// ZOESKOUL_BREVO_CAMPAIGN_DIAGNOSTICS_V77C9
async function resolveVerifiedCampaignSender(
  options: ChallengeCampaignOptions,
): Promise<{ email: string; name: string }> {
  const payload = await brevoApiJson<RawBrevoSendersPayload>(
    "/senders",
    { method: "GET" },
    options,
  );

  const senders = Array.isArray(payload.senders)
    ? (payload.senders as RawBrevoSender[])
    : [];

  const matching = senders.find(
    (sender) =>
      normalizeBrevoEmail(stringValue(sender.email)) ===
      normalizeBrevoEmail(PUBLIC_CHALLENGE_SENDER_EMAIL),
  );

  if (!matching) {
    throw new BrevoConfigurationError(
      `Brevo sender ${PUBLIC_CHALLENGE_SENDER_EMAIL} does not exist in this Brevo account.`,
    );
  }

  if (matching.active !== true) {
    throw new BrevoConfigurationError(
      `Brevo sender ${PUBLIC_CHALLENGE_SENDER_EMAIL} is not active/verified. Verify it in Brevo before sending challenge campaigns.`,
    );
  }

  return {
    email: PUBLIC_CHALLENGE_SENDER_EMAIL,
    name: PUBLIC_CHALLENGE_SENDER_NAME,
  };
}


async function createExclusionList(
  sourceList: PublicChallengeAudienceList,
  emails: string[],
  title: string,
  options: ChallengeCampaignOptions,
): Promise<number | null> {
  if (!emails.length) return null;

  const created = await brevoApiJson<{ id?: unknown }>(
    "/contacts/lists",
    {
      method: "POST",
      body: JSON.stringify({
        folderId: sourceList.folderId,
        name: `ZoeSkoul challenge exclusions · ${title.trim().slice(0, 54)} · ${Date.now()}`,
      }),
    },
    options,
  );

  const exclusionListId = positiveInt(created.id);
  if (!exclusionListId) {
    throw new Error("Brevo did not return an exclusion-list ID.");
  }

  for (let index = 0; index < emails.length; index += EXCLUSION_ADD_CHUNK) {
    const chunk = emails.slice(index, index + EXCLUSION_ADD_CHUNK);
    const result = await brevoApiJson<{
      success?: unknown;
      failure?: unknown;
    }>(
      `/contacts/lists/${exclusionListId}/contacts/add`,
      {
        method: "POST",
        body: JSON.stringify({ emails: chunk }),
      },
      options,
    );

    if (Array.isArray(result.failure) && result.failure.length) {
      throw new Error(
        "Brevo could not add every deselected contact to the exclusion list.",
      );
    }
  }

  return exclusionListId;
}

async function createCampaign(
  input: CampaignCreateArgs,
  options: ChallengeCampaignOptions,
): Promise<number> {
  const sender = await resolveVerifiedCampaignSender(options);
  const rendered = renderPublicChallengeCampaign(input);
  const recipients: {
    listIds: number[];
    exclusionListIds?: number[];
  } = {
    listIds: [input.sourceListId],
  };

  if (input.exclusionListId) {
    recipients.exclusionListIds = [input.exclusionListId];
  }

  const created = await brevoApiJson<{ id?: unknown }>(
    "/emailCampaigns",
    {
      method: "POST",
      body: JSON.stringify({
        name: campaignName(input.title, input.testLabel),
        sender,
        replyTo: PUBLIC_CHALLENGE_REPLY_TO,
        subject: rendered.subject,
        previewText: rendered.previewText,
        htmlContent: rendered.html,
        recipients,
      }),
    },
    options,
  );

  const campaignId = positiveInt(created.id);
  if (!campaignId) {
    throw new Error("Brevo did not return a campaign ID.");
  }

  return campaignId;
}

function normalizedExclusions(
  audience: PublicChallengeAudienceContactsResponse,
  excludedEmails: readonly string[],
) {
  const selectable = new Set(
    audience.contacts
      .filter((contact) => contact.selectable)
      .map((contact) => contact.email),
  );

  return Array.from(
    new Set(
      excludedEmails
        .map(normalizeBrevoEmail)
        .filter(
          (email) =>
            isValidBrevoEmail(email) && selectable.has(email),
        ),
    ),
  );
}

export async function sendPublicChallengeCampaignTest(
  input: ChallengeEmailContent & {
    sourceListId: number;
    testEmail: string;
  },
  options: ChallengeCampaignOptions = {},
): Promise<PublicChallengeEmailTestResponse> {
  const testEmail = normalizeBrevoEmail(input.testEmail);
  if (!isValidBrevoEmail(testEmail)) {
    throw new Error("Choose a valid Brevo-list test recipient.");
  }

  const audience = await listPublicChallengeAudienceContacts(
    input.sourceListId,
    options,
  );
  const testContact = audience.contacts.find(
    (contact) => contact.email === testEmail,
  );

  if (!testContact) {
    throw new Error(
      "The test recipient is not in the selected Brevo list.",
    );
  }

  if (!testContact.selectable) {
    throw new Error(
      `The test recipient is ${testContact.suppressionReason ?? "suppressed"} in Brevo.`,
    );
  }

  const campaignId = await createCampaign(
    {
      ...input,
      testLabel: true,
    },
    options,
  );

  const response = await brevoApiFetch(
    `/emailCampaigns/${campaignId}/sendTest`,
    {
      method: "POST",
      body: JSON.stringify({ emailTo: [testEmail] }),
    },
    options,
  );

  if (!response.ok) {
    throw new BrevoApiError(
      response.status,
      await readBrevoErrorDetail(response),
    );
  }

  return {
    ok: true,
    action: "test",
    campaignId,
    testEmail,
  };
}

export async function sendPublicChallengeCampaignNow(
  input: ChallengeEmailContent & {
    sourceListId: number;
    excludedEmails: readonly string[];
  },
  options: ChallengeCampaignOptions = {},
): Promise<PublicChallengeEmailSendResponse> {
  const audience = await listPublicChallengeAudienceContacts(
    input.sourceListId,
    options,
  );
  const exclusions = normalizedExclusions(
    audience,
    input.excludedEmails,
  );
  const selectedCount = audience.counts.selectable - exclusions.length;

  if (selectedCount <= 0) {
    throw new Error("Select at least one available Brevo contact.");
  }

  const exclusionListId = await createExclusionList(
    audience.list,
    exclusions,
    input.title,
    options,
  );

  const campaignId = await createCampaign(
    {
      ...input,
      exclusionListId,
    },
    options,
  );

  const response = await brevoApiFetch(
    `/emailCampaigns/${campaignId}/sendNow`,
    { method: "POST" },
    options,
  );

  if (!response.ok) {
    throw new BrevoApiError(
      response.status,
      await readBrevoErrorDetail(response),
    );
  }

  return {
    ok: true,
    action: "send",
    campaignId,
    sourceListId: input.sourceListId,
    exclusionListId,
    selectedCount,
  };
}
