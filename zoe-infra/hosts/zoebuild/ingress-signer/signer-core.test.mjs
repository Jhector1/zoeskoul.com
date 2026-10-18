import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import http from "node:http";
import { after, before, test } from "node:test";
import { createSignerHandler } from "./signer-core.mjs";

const edgeSecret = "edge-authentication-secret-very-long-xyz-2026";
const signingKey = "buyer-ip-signature-key-long-and-distinct-2026";
const fixedNow = 1_792_260_000_000;
let upstream;
let signer;
let signerPort;
let last;

const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
function request(path = "/api/build/checkout?x=1", opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1", port: signerPort, method: opts.method ?? "POST", path,
      headers: { host: "build.zoeskoul.com", ...opts.headers },
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", part => { body += part; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    req.on("error", reject);
    req.end(opts.body ?? "");
  });
}
function trustedHeaders(ip = "203.0.113.15") {
  return { "x-zoebuild-edge-auth": edgeSecret, "x-zoebuild-edge-ip": ip };
}
before(async () => {
  upstream = http.createServer((req, res) => {
    last = { method: req.method, url: req.url, headers: req.headers };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const upstreamPort = await listen(upstream);
  signer = http.createServer(createSignerHandler({ edgeSecret, signingKey, upstreamHost: "127.0.0.1", upstreamPort, now: () => fixedNow }));
  signerPort = await listen(signer);
});
after(async () => { await close(signer); await close(upstream); });

test("rejects unsigned requests, forged proof, invalid edge IP", async () => {
  assert.equal((await request()).status, 403);
  assert.equal((await request("/x", { headers: { "x-zoebuild-buyer-ip": "198.51.100.1" } })).status, 403);
  assert.equal((await request("/x", { headers: trustedHeaders("invalid IP") })).status, 403);
  assert.equal((await request("/x", { headers: { ...trustedHeaders(), "x-zoebuild-edge-auth": "wrong" } })).status, 403);
});
test("overwrites forged proof and signs correct method, pathname, timestamp, IP", async () => {
  const response = await request("/api/build/checkout?x=1", {
    headers: { ...trustedHeaders(), "x-zoebuild-buyer-ip": "198.51.100.66", "x-zoebuild-buyer-ip-timestamp": "123", "x-zoebuild-buyer-ip-signature": "0".repeat(64), "x-forwarded-for": "198.51.100.66", "content-type": "application/json" },
    body: JSON.stringify({ operation: "cart.get" }),
  });
  assert.equal(response.status, 200);
  assert.equal(last.method, "POST");
  assert.equal(last.url, "/api/build/checkout?x=1");
  assert.equal(last.headers["x-zoebuild-buyer-ip"], "203.0.113.15");
  assert.equal(last.headers["x-forwarded-for"], "203.0.113.15");
  assert.equal(last.headers["x-zoebuild-buyer-ip-timestamp"], "1792260000");
  const expected = createHmac("sha256", signingKey).update("v1\nPOST\n/api/build/checkout\n1792260000\n203.0.113.15", "utf8").digest("hex");
  assert.equal(last.headers["x-zoebuild-buyer-ip-signature"], expected);
  assert.equal(last.headers["x-zoebuild-edge-auth"], undefined);
  assert.equal(last.headers["x-zoebuild-edge-ip"], undefined);
});
test("supports IPv6 and a query without including query in the signed pathname", async () => {
  assert.equal((await request("/sites/checkout?token=ignored", { method: "GET", headers: trustedHeaders("2001:db8::1") })).status, 200);
  const expected = createHmac("sha256", signingKey).update("v1\nGET\n/sites/checkout\n1792260000\n2001:db8::1").digest("hex");
  assert.equal(last.headers["x-zoebuild-buyer-ip-signature"], expected);
});
test("refuses missing, weak, or shared secrets before startup", () => {
  for (const invalid of ["", "short", undefined]) {
    assert.throws(() => createSignerHandler({ edgeSecret: invalid, signingKey, upstreamHost: "zoebuild" }));
    assert.throws(() => createSignerHandler({ edgeSecret, signingKey: invalid, upstreamHost: "zoebuild" }));
  }
  assert.throws(() => createSignerHandler({ edgeSecret, signingKey: edgeSecret, upstreamHost: "zoebuild" }));
});
test("blocks absolute-form and network-path request targets", async () => {
  assert.equal((await request("//untrusted.test/path", { headers: trustedHeaders() })).status, 400);
});
