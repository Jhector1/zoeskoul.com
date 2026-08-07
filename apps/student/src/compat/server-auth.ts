/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Browser boundary for the Next/Auth server module.
 *
 * Student UI obtains its authenticated session through StudentAccessGate and
 * native Student session context. Server Auth.js handlers must remain
 * in apps/web.
 */
export const handlers: any = {};

export async function auth(): Promise<any> {
  return null;
}

export async function signIn(): Promise<never> {
  throw new Error(
    "Server signIn is unavailable in the student browser app.",
  );
}

export async function signOut(): Promise<never> {
  throw new Error(
    "Server signOut is unavailable in the student browser app.",
  );
}
