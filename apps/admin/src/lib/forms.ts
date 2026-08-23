export function formSearchParams(form: HTMLFormElement) {
  const params = new URLSearchParams();

  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) params.set(key, normalized);
  }

  return params;
}
