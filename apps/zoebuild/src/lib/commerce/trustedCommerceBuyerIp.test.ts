import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { trustedCommerceBuyerIpFromRequest } from "./trustedCommerceBuyerIp";

const KEY = "test-only-signing-key-with-at-least-32-characters";
const NOW = 1_792_266_000_000;
const TS = String(Math.floor(NOW / 1000));
const REQUEST_URL = "https://build.example.test/api/build/projects/p-1/commerce/preview";
function signed(input: Readonly<{
  ip?: string; ts?: string; method?: string; url?: string; key?: string;
  signature?: string; extra?: Record<string, string>;
}> = {}) {
  const ip = input.ip ?? "198.51.100.25";
  const ts = input.ts ?? TS;
  const method = input.method ?? "POST";
  const url = input.url ?? REQUEST_URL;
  const payload = `v1\n${method}\n${new URL(url).pathname}\n${ts}\n${ip}`;
  const sig = input.signature ?? createHmac("sha256", input.key ?? KEY)
    .update(payload, "utf8").digest("hex");
  return new Request(url, { method, headers: {
    "x-zoebuild-buyer-ip": ip,
    "x-zoebuild-buyer-ip-timestamp": ts,
    "x-zoebuild-buyer-ip-signature": sig,
    ...input.extra,
  } });
}
const resolve = (request: Request, key = KEY, nowMs = NOW) =>
  trustedCommerceBuyerIpFromRequest(request, { signingKey: key, nowMs });

describe("signed trusted commerce buyer IP", () => {
  it("accepts a fresh, correctly signed IPv4 address", () => {
    expect(resolve(signed())).toBe("198.51.100.25");
  });
  it("accepts an IPv6 buyer address", () => {
    expect(resolve(signed({ ip: "2001:db8::2" }))).toBe("2001:db8::2");
  });
  it("does not trust spoofed forwarding headers alone", () => {
    const request = new Request(REQUEST_URL, { method: "POST", headers: {
      "x-real-ip": "198.51.100.25", "x-forwarded-for": "198.51.100.25",
    } });
    expect(resolve(request)).toBeNull();
  });
  it("rejects forged signatures and incorrect key", () => {
    expect(resolve(signed({ signature: "0".repeat(64) }))).toBeNull();
    expect(resolve(signed({}), "a-different-private-signing-key-with-length-32")).toBeNull();
  });
  it("rejects stale and future timestamp beyond one minute", () => {
    expect(resolve(signed({ ts: String(Number(TS) - 61) }))).toBeNull();
    expect(resolve(signed({ ts: String(Number(TS) + 61) }))).toBeNull();
    expect(resolve(signed({ ts: String(Number(TS) - 60) }))).toBe("198.51.100.25");
  });
  it("binds proof to HTTP method and pathname", () => {
    const request = signed();
    expect(resolve(new Request(REQUEST_URL.replace("/preview", "/other"), {
      method: "POST", headers: request.headers,
    }))).toBeNull();
    expect(resolve(new Request(REQUEST_URL, { method: "PUT", headers: request.headers }))).toBeNull();
  });
  it("rejects malformed IP values and multiple addresses", () => {
    expect(resolve(signed({ ip: "198.51.100.25, 203.0.113.3" }))).toBeNull();
    expect(resolve(signed({ ip: "nope" }))).toBeNull();
  });
  it("requires a strong configured signing key", () => {
    expect(resolve(signed(), "short")).toBeNull();
    expect(resolve(signed(), "")).toBeNull();
  });
  it("rejects noncanonical signatures, timestamps and missing proof", () => {
    expect(resolve(signed({ signature: "not-hex" }))).toBeNull();
    expect(resolve(signed({ ts: "not-a-timestamp" }))).toBeNull();
    expect(resolve(new Request(REQUEST_URL, { method: "POST" }))).toBeNull();
  });
});
