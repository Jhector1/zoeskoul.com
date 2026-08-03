import {
  signIn,
} from "next-auth/react";

export type AuthProviderId =
  | "google"
  | "keycloak";

export function signInWithProvider(
  providerId: AuthProviderId,
  redirectTo: string,
) {
  return signIn(providerId, {
    redirectTo,
  });
}
