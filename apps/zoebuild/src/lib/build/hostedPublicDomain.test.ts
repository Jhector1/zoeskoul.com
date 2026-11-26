import assert from "node:assert/strict";
import { test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createHostedPublicDomain } from "./hostedPublicDomain";

const domain = () => createHostedPublicDomain("https://zoebuild.site", "https://build.zoeskoul.com");
test("maps two existing reservations without mutating their identities", () => {
  const policy = domain();
  assert.equal(policy.domain, "zoebuild.site");
  for (const label of ["blue-gallery", "snake-game", "site-" + "a".repeat(24)]) {
    const reservation = label + ".sites.zoebuild.test";
    const alias = label + ".zoebuild.site";
    assert.equal(policy.publicHostname(reservation), alias);
    assert.equal(policy.canonicalHostname(alias), reservation);
  }
});
test("rejects overlapping platform origins", () => {
  for (const control of ["https://zoebuild.site", "https://build.zoebuild.site", "https://a.b.zoebuild.site"]) {
    assert.throws(() => createHostedPublicDomain("https://zoebuild.site", control), /INVALID_HOSTED_PUBLIC_DOMAIN/);
  }
});
test("rejects non-HTTPS, malformed and unsupported public origins", () => {
  for (const origin of ["", "http://zoebuild.site", "https://zoebuild.site:443", "https://u@zoebuild.site",
    "https://zoebuild.site/path", "https://zoebuild.site?x", "https://zoebuild.site#x", "https://zoebuild.site.",
    "https://%7aoebuild.site", "https://a.zoebuild.site", "https://co.uk", "https://zoebuild.test",
    "https://localhost", "https://127.0.0.1", "https://xn--abc.site", "https://-bad.site", "https://bad..site", "https://zoebuild.site\n"]) {
    assert.throws(() => createHostedPublicDomain(origin, "https://zoeskoul.com"), /INVALID_HOSTED_PUBLIC_DOMAIN/);
  }
});
test("rejects invalid control configuration without fallback", () => {
  for (const control of ["", "http://zoeskoul.com", "https://zoeskoul.co.uk", "https://localhost", "https://zoeskoul.com:443"]) {
    assert.throws(() => createHostedPublicDomain("https://zoebuild.site", control), /INVALID_HOSTED_PUBLIC_DOMAIN/);
  }
});
test("rejects malformed, reserved or outside hostnames", () => {
  const policy = domain();
  for (const host of ["zoebuild.site", "admin.zoebuild.site", "www.zoebuild.site", "a.b.zoebuild.site",
    "blue-gallery.zoebuild.site.evil.com", "blue-gallery.zoebuild.site:443", "blue-gallery.zoebuild.site.",
    "BLUE-GALLERY.zoebuild.site", "a@zoebuild.site", "site-abc.zoebuild.site", "ns42.zoebuild.site",
    "xn--abc.zoebuild.site", "blue-gallery.sites.zoebuild.test"]) assert.equal(policy.canonicalHostname(host), null);
  for (const reservation of ["admin.sites.zoebuild.test", "blue-gallery.zoebuild.site", "site-abc.sites.zoebuild.test"]) {
    assert.throws(() => policy.publicHostname(reservation), /INVALID_HOSTED_RESERVATION/);
  }
});
test("accepts separately configured supported domains without hardcoding the proposed name", () => {
  for (const suffix of ["com", "net", "org", "site", "app", "dev"]) {
    const p = createHostedPublicDomain(`https://example.${suffix}/`, "https://build.zoeskoul.com");
    assert.equal(p.publicHostname("blue-gallery.sites.zoebuild.test"), `blue-gallery.example.${suffix}`);
  }
});
