# Dedicated private pilot image. Never used by the editor or learner runtimes.
FROM ghcr.io/jhector1/zoeskoul-node-base:22-bookworm-slim
WORKDIR /workspace
# Required by workerd system TLS initialization,
# including isolated offline execution.
RUN apt-get -o Acquire::Retries=5 update \
 && apt-get -o Acquire::Retries=5 install -y --no-install-recommends ca-certificates \
 && update-ca-certificates \
 && test -s /etc/ssl/certs/ca-certificates.crt \
 && grep -q 'BEGIN CERTIFICATE' /etc/ssl/certs/ca-certificates.crt \
 && rm -rf /var/lib/apt/lists/*

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_DIR=/etc/ssl/certs

# Matches the registered TanStack reference template. Preserve the generated lock
# in the immutable image; pin its full dependency graph before customer rollout.
RUN npm init -y >/dev/null && npm install --save-exact --no-audit --no-fund wrangler@4.156.1 \
 && node -e 'if(require("./node_modules/wrangler/package.json").version!=="4.156.1") process.exit(1)' \
 && npm cache clean --force
COPY apps/runner/src/services/build/tanstackWorkerRuntimePolicy.ts /opt/zoebuild/tanstackWorkerRuntimePolicy.ts
COPY zoe-infra/hosts/zoebuild/publish-pilot/launch.mjs /opt/zoebuild/launch.mjs
RUN mkdir -p /workspace/dist && chmod -R a+rX /opt/zoebuild /workspace
ENV HOME=/tmp NODE_ENV=production WRANGLER_SEND_METRICS=false CLOUDFLARE_CF_FETCH_ENABLED=false
USER 1000:1000
ENTRYPOINT ["node","--experimental-strip-types","/opt/zoebuild/launch.mjs"]
