FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    bash \
    ca-certificates \
    build-essential \
    gcc \
    g++ \
    openjdk-21-jdk \
    python3 \
    python3-pip \
    nodejs \
    npm \
    tini \
    coreutils \
    findutils \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1000 runner && useradd -m -u 1000 -g 1000 -s /bin/bash runner

WORKDIR /workspace

RUN mkdir -p /opt/runner
COPY pty-runner.py /opt/runner/pty-runner.py
RUN chmod 755 /opt/runner/pty-runner.py

USER runner

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python3", "/opt/runner/pty-runner.py"]