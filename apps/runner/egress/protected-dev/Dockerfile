# Phase 2C3: reproducible, fail-closed development gateway build.
# The builder MUST be an already resolved, operator-checked digest.
ARG BUILDER_IMAGE=golang@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280
FROM ${BUILDER_IMAGE} AS build
WORKDIR /src
COPY go.mod gateway.go gateway_test.go ./
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off
RUN go test -count=1 ./... && go build -trimpath -ldflags='-s -w' -o /out/gateway ./gateway.go

FROM scratch
LABEL com.zoeskoul.learning.egress-proxy="v1" \
      com.zoeskoul.learning.egress-gateway-phase="2c3-development-audit-only"
COPY --from=build /out/gateway /gateway
USER 1000:1000
EXPOSE 3128
HEALTHCHECK --interval=5s --timeout=2s --start-period=4s --retries=3 CMD ["/gateway", "--healthcheck"]
ENTRYPOINT ["/gateway"]
