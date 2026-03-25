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

RUN useradd -m -s /bin/bash runner

WORKDIR /workspace

COPY boot.sh /usr/local/bin/boot.sh
RUN chmod +x /usr/local/bin/boot.sh

USER runner

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/boot.sh"]