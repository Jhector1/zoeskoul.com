import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
}

describe("Website-owned cross-app authentication return boundary", () => {
  it("lets the page, not the layout, handle authenticated callbacks", () => {
    const layout = source("./layout.tsx");
    const page = source("./page.tsx");
    expect(layout).not.toContain('redirect("/profile")');
    expect(page).toContain("auth()");
    expect(page).toContain("resolveRequestedAuthCallback");
    expect(page).toContain("redirect(callbackUrl)");
  });

  it("passes the server-validated destination to the provider sign-in", () => {
    const page = source("./page.tsx");
    const client = source("./AuthenticateClient.tsx");
    expect(page).toContain("<AuthenticateClient callbackUrl={callbackUrl} />");
    expect(client).toContain("signInWithProvider(providerId, callbackUrl)");
    expect(client).not.toContain("resolveRequestedAuthCallback");
  });
});
