#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
./zoeskoul-learning/smoke-test.sh
./zoebuild/smoke-test.sh
./gateway/smoke-test.sh
