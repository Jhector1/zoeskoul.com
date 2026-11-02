#!/usr/bin/env python3
"""Fail-closed ZoeBuild image pin preflight. Reads rendered Compose JSON on stdin."""
import json
import os
import re
import sys


def verify(config: dict, environment: dict) -> None:
    owner = environment.get("GHCR_OWNER", "").lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", owner):
        raise ValueError("Invalid registry owner")
    service = config.get("services", {}).get("runner", {})
    runtime = service.get("environment", {})
    if not isinstance(runtime, dict):
        raise ValueError("Invalid Runner environment")
    for name, actual in (
        ("runner", service.get("image")),
        ("runtime", runtime.get("RUNNER_IMAGE")),
    ):
        setting = "RUNNER_SERVICE_IMAGE_REF" if name == "runner" else "RUNNER_IMAGE_REF"
        expected = environment.get(setting, "")
        prefix = f"ghcr.io/{owner}/zoeskoul-{name}@sha256:"
        if not re.fullmatch(re.escape(prefix) + r"[a-f0-9]{64}", expected):
            raise ValueError(f"{setting} must be a verified image digest for zoeskoul-{name}")
        if actual != expected:
            raise ValueError(f"{name} rendered image does not match {setting}")


def main() -> int:
    try:
        if len(sys.argv) != 2 or sys.argv[1] != "zoebuild":
            raise ValueError("Only the ZoeBuild pool uses the mandatory digest gate")
        verify(json.load(sys.stdin), os.environ)
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"ZOEBUILD_IMAGE_PIN_GATE_FAIL: {exc}", file=sys.stderr)
        return 1
    print("ZOEBUILD_IMAGE_PIN_GATE_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
