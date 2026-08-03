export default function Google(
  options: Record<string, unknown> = {},
) {
  return {
    id: "google",
    name: "Google",
    type: "oidc",
    ...options,
  };
}
