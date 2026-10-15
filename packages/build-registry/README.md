# @zoeskoul/build-registry

Canonical registry of stack definitions supported by ZoeBuild.

The registry contains ZoeBuild-owned logical IDs only. Provider-specific
implementations (Cloudflare, Neon, Expo, etc.) belong in adapter packages and
must not leak into this registry.

V300B intentionally registers only static-html-v1 and react-vite-v1. Managed
backend/full-stack/mobile stacks remain unsupported until their execution and
resource policies exist.
