# Build only on the development VM, from an operator-verified base digest.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir playwright==1.57.0
COPY render.py /opt/zoe-thumbnail/render.py
LABEL com.zoeskoul.thumbnail-renderer.version="3"
ENV HOME=/tmp PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER 1000:1000
ENTRYPOINT ["python", "-I", "-u", "/opt/zoe-thumbnail/render.py"]
