import http from "node:http";
import { createSignerHandler } from "./signer-core.mjs";

// Never start a partially configured ingress. Secrets are only read from the
// server process environment and must not be included in logs or responses.
const handler = createSignerHandler({
  edgeSecret: process.env.ZOEBUILD_EDGE_SHARED_SECRET,
  signingKey: process.env.ZOEBUILD_BUYER_IP_SIGNING_KEY,
  upstreamHost: "zoebuild",
  upstreamPort: 3004,
});
const server = http.createServer(handler);
server.headersTimeout = 15_000;
server.requestTimeout = 60_000;
server.listen(8090, "0.0.0.0", () => {
  console.log("zoebuild_ingress_signer=READY port=8090 (internal only)");
});
