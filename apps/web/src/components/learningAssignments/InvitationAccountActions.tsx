"use client";

import { signOut } from "next-auth/react";

export default function InvitationAccountActions({
  callbackUrl,
}: {
  callbackUrl: string;
}) {
  async function switchAccount() {
    await signOut({ callbackUrl });
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
