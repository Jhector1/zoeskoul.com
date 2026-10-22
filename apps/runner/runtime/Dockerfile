# syntax=docker/dockerfile:1.7

FROM ubuntu:24.04 AS runtime

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG NODE_MAJOR=22

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TERM=xterm-256color \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp \
    NODE_PATH=/opt/zoeskoul-node-modules

RUN set -eux; \
  apt_install_retry() { \
    local attempt; \
    for attempt in 1 2 3; do \
      rm -rf /var/lib/apt/lists/*; \
      if apt-get -o Acquire::Retries=5 update \
        && apt-get -o Acquire::Retries=5 install -y --no-install-recommends "$@"; then \
        return 0; \
      fi; \
      echo "apt install attempt ${attempt}/3 failed; refreshing indexes and retrying" >&2; \
      sleep "$((attempt * 5))"; \
    done; \
    return 1; \
  }; \
  apt_install_retry \
    ca-certificates \
    curl \
    gpg; \
  mkdir -p /etc/apt/keyrings; \
  curl -fsSL --retry 5 --retry-delay 2 --retry-connrefused \
    https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg; \
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list; \
  apt_install_retry \
    bash \
    coreutils \
    findutils \
    gcc \
    g++ \
    git \
    libc6-dev \
    make \
    gdb \
    valgrind \
    nodejs \
    sqlite3 \
    openjdk-21-jdk-headless \
    python3 \
    r-base \
    tini; \
  apt-get purge -y --auto-remove gpg; \
  rm -rf /var/lib/apt/lists/*
RUN set -eux; \
  npm install --global --omit=dev --no-audit --no-fund express@5.2.1; \
  global_root="$(npm root --global)"; \
  ln -s "${global_root}" /opt/zoeskoul-node-modules; \
  NODE_PATH=/opt/zoeskoul-node-modules node -e 'const express = require("express"); if (typeof express !== "function") process.exit(1);'; \
  node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(":memory:"); db.exec("CREATE TABLE health(id INTEGER PRIMARY KEY, value TEXT)"); db.prepare("INSERT INTO health(value) VALUES (?)").run("ok"); const row = db.prepare("SELECT value FROM health WHERE id = 1").get(); if (!row || row.value !== "ok") process.exit(1); db.close();';   sqlite3 --version;   curl --version >/dev/null

RUN mkdir -p /opt/runner /workspace /tmp \
 && if ! getent group 1000 >/dev/null; then groupadd --gid 1000 sandbox; fi \
 && if ! getent passwd 1000 >/dev/null; then \
      useradd --uid 1000 --gid 1000 --create-home --home-dir /home/sandbox --shell /usr/sbin/nologin sandbox; \
    fi \
 && chown -R 1000:1000 /opt/runner /workspace /tmp \
 && chmod 1777 /tmp
# ZoeBuild trusted React/Vite build runtime.
# Pin pnpm in the image so hardened build containers never rely on
# Corepack network activation at execution time.
RUN npm install --global --ignore-scripts pnpm@10.33.0 \
 && command -v pnpm \
 && pnpm --version

# ZoeBuild's registered React/Vite dependency layer is immutable runtime
# infrastructure. Project source never writes this directory.
COPY --chown=1000:1000 apps/runner/runtime/react-vite-v1/package.json \
  /opt/zoeskoul/react-vite-v1/package.json
COPY --chown=1000:1000 apps/runner/runtime/react-vite-v1/pnpm-lock.yaml \
  /opt/zoeskoul/react-vite-v1/pnpm-lock.yaml

RUN set -eux; \
  cd /opt/zoeskoul/react-vite-v1; \
  pnpm install --frozen-lockfile; \
  mkdir -p node_modules/.vite node_modules/.vite-temp; \
  sha256sum pnpm-lock.yaml | awk '{print $1}' > .lock-sha256; \
  test -x node_modules/.bin/vite; \
  test -x node_modules/.bin/tsc; \
  chown -R 1000:1000 /opt/zoeskoul/react-vite-v1

WORKDIR /workspace

COPY --chown=1000:1000 apps/runner/pty-runner.py /opt/runner/pty-runner.py

RUN chmod 0555 /opt/runner/pty-runner.py \
 && Rscript --version \
 && test "$(Rscript --vanilla -e 'cat(mean(c(2, 4, 6)))')" = "4"

USER 1000:1000

ENTRYPOINT ["/usr/bin/tini", "--", "python3", "/opt/runner/pty-runner.py"]
