# Protected egress images (development only)

Build from the checked-in source, using the exact builder and admin digests in the two Dockerfiles. The firewall image pins the directly installed nftables package to the version observed in Phase 2C5B2. Transitive APT package resolution remains mutable; this is not a reproducible production build.

The firewall image doubles as a trusted sleep-only namespace holder (Runner overrides its entrypoint to `/usr/bin/sleep`); the one-shot helper runs as namespaced root with only NET_ADMIN, no host mounts, and a fixed entrypoint. It validates the target namespace, private lab IP, fixed host policy and deadline, then uses expiring nftables IP sets and default-deny chains. The Go process enters the prefiltered holder namespace without capabilities.

The gateway's exact HTTP destinations are archive.ubuntu.com and security.ubuntu.com, on port 80; example.com is allowed for CONNECT on TCP 443. The controlling operator must provide canonical public IPv4 pins for these three names. IP sets are intended to expire independently of the gateway; this new timeout mechanism must pass VM testing. Do not add domains or broaden the ports automatically. Shared-hosting IPs do not constitute a hostname security boundary if the gateway is compromised.

Environment inputs are `ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE`, `ZOESKOUL_LEARNING_ADMIN_EGRESS_FIREWALL_IMAGE` (exact local image IDs), `ZOESKOUL_LEARNING_ADMIN_EGRESS_PINS_JSON` (Unix epoch seconds `expiresAt`, three `hosts` arrays), and `ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK=PROTECTED_LIFECYCLE_TEST_ONLY`. Do not enable in deployment until source, image, actual Runner, expiration, cleanup and isolation acceptance pass. The default offline policy needs none of these inputs.
