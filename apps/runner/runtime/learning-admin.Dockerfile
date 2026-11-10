# syntax=docker/dockerfile:1.7
# Dedicated disposable Linux administration image; not for standard shells.
# Source-only publishing: deploying/authorizing this image is a separate gate.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8 TERM=xterm-256color
RUN set -eux; \
    apt-get -o Acquire::Retries=5 update; \
    apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
      bash coreutils findutils python3 login passwd sudo tini util-linux procps; \
    rm -rf /var/lib/apt/lists/*; \
    mkdir -p /opt/runner /workspace; \
    if ! getent group 1000 >/dev/null; then groupadd --gid 1000 sandbox; fi; \
    if getent passwd 1000 >/dev/null; then \
      old_user="$(getent passwd 1000 | cut -d: -f1)"; \
      if [ "$old_user" != sandbox ]; then \
        usermod --login sandbox --home /workspace --shell /bin/bash "$old_user"; \
      fi; \
    else \
      useradd --uid 1000 --gid 1000 --home-dir /workspace --shell /bin/bash sandbox; \
    fi; \
    passwd -l root; \
    passwd -l sandbox; \
    usermod -aG sudo sandbox; \
    chmod 1777 /workspace /tmp
COPY apps/runner/pty-runner.py /opt/runner/pty-runner.py
COPY apps/runner/runtime/learning-admin-init.sh /opt/runner/admin-init.sh
RUN chmod 0555 /opt/runner/pty-runner.py /opt/runner/admin-init.sh
LABEL com.zoeskoul.learning.admin-lab="true"
WORKDIR /workspace
USER root
ENTRYPOINT ["/usr/bin/tini","--","/opt/runner/admin-init.sh"]
CMD ["python3","/opt/runner/pty-runner.py"]
