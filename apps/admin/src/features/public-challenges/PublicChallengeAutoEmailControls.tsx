"use client";

import type {
  PublicChallengeAudienceListsResponse,
  PublicChallengeSocialAutomationSettings,
} from "@zoeskoul/api-contracts";

export default function PublicChallengeAutoEmailControls(props: {
  settings: PublicChallengeSocialAutomationSettings | null;
  email: PublicChallengeAudienceListsResponse | null;
  onChange: (settings: PublicChallengeSocialAutomationSettings) => void;
}) {
  const { settings, email, onChange } = props;
  if (!settings) return null;

  const defaultListId =
    email?.defaultListId ??
    email?.lists[0]?.id ??
    null;
  const selectedListId =
    settings.emailListId ?? defaultListId;

  return (
    <section className="mt-4 border-t border-neutral-200 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-950">
            Automatic email
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-600">
            Send the same daily manifest challenge through Brevo. Existing
            unsubscribe and blacklist suppression rules remain authoritative.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={settings.emailEnabled}
            disabled={email?.configured !== true}
            onChange={(event) => {
              const enabled = event.target.checked;
              onChange({
                ...settings,
                emailEnabled: enabled,
                emailListId: enabled
                  ? selectedListId
                  : null,
              });
            }}
          />
          Email
        </label>
      </div>

      {email?.configured === false ? (
        <p className="mt-3 text-xs text-neutral-600">
          Brevo is not configured in this environment.
        </p>
      ) : null}

      {settings.emailEnabled ? (
        <label className="mt-3 block max-w-md">
          <span className="text-xs font-medium text-neutral-700">
            Brevo audience list
          </span>
          <select
            className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            value={selectedListId ?? ""}
            onChange={(event) => {
              onChange({
                ...settings,
                emailListId: event.target.value
                  ? Number(event.target.value)
                  : null,
              });
            }}
          >
            <option value="">Choose a Brevo list</option>
            {(email?.lists ?? []).map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
                {list.isDefault ? " · default" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  );
}
