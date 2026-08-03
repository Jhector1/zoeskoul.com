export default function Keycloak(
  options: Record<string, unknown> = {},
) {
  return {
    id: "keycloak",
    name: "Keycloak",
    type: "oidc",
    ...options,
  };
}
