FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    curl \
    findutils \
    gcc \
    g++ \
    gpg \
    libc6-dev \
    make \
    openjdk-21-jdk-headless \
    python3 \
    tini \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

RUN mkdir -p /opt/runner /workspace \
 && chown -R 1000:1000 /opt/runner /workspace

COPY --chown=1000:1000 apps/runner/pty-runner.py /opt/runner/pty-runner.py

USER 1000:1000

ENTRYPOINT ["/usr/bin/tini", "--", "python3", "/opt/runner/pty-runner.py"]