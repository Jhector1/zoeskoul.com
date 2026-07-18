# syntax=docker/dockerfile:1.7

FROM ubuntu:24.04 AS runtime

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG NODE_MAJOR=22

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TERM=xterm-256color \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gpg \
 && mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
    bash \
    coreutils \
    findutils \
    gcc \
    g++ \
    git \
    libc6-dev \
    make \
    nodejs \
    openjdk-21-jdk-headless \
    python3 \
    tini \
 && apt-get purge -y --auto-remove curl gpg \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/runner /workspace /tmp \
 && if ! getent group 1000 >/dev/null; then groupadd --gid 1000 sandbox; fi \
 && if ! getent passwd 1000 >/dev/null; then \
      useradd --uid 1000 --gid 1000 --create-home --home-dir /home/sandbox --shell /usr/sbin/nologin sandbox; \
    fi \
 && chown -R 1000:1000 /opt/runner /workspace /tmp \
 && chmod 1777 /tmp

WORKDIR /workspace

COPY --chown=1000:1000 apps/runner/pty-runner.py /opt/runner/pty-runner.py

RUN chmod 0555 /opt/runner/pty-runner.py

USER 1000:1000

ENTRYPOINT ["/usr/bin/tini", "--", "python3", "/opt/runner/pty-runner.py"]