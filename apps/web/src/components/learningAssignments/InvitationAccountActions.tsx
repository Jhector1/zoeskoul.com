"use client";

import {
  buildWebLogoutUrl,
} from "@/lib/auth/logout";

export default function InvitationAccountActions({
  callbackUrl,
}: {
  callbackUrl: string;
}) {
  function switchAccount() {
    const locale =
      window.location.pathname
        .split("/")
        .filter(Boolean)[0] ??
      "en";

    window.location.assign(
      buildWebLogoutUrl({
        websiteOrigin:
          window.location.origin,
        locale,
        postLogoutRedirect:
          callbackUrl,
      }),
    );
  }

  return (
    <button
      type="button"
      onClick={switchAccount}
      className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
    >
      Sign out and use the invited email
    </button>
  );
}
