# Stdlib-only internal HMAC signer; no package install or Docker socket.
FROM ghcr.io/jhector1/zoeskoul-node-base:22-bookworm-slim
WORKDIR /app
COPY zoe-infra/hosts/zoebuild/ingress-signer/*.mjs ./
USER node
ENV NODE_ENV=production
EXPOSE 8090
CMD ["node", "/app/server.mjs"]
