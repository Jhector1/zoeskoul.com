#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/admin/Documents/NextJSProject/zoeskoul-web-infra"
WEB="$ROOT/apps/web"
EXPECTED_BRANCH="main"
EXPECTED_HEAD="f211ba3f68ef07847659291aa5bdbcd4d555da46"

cd "$ROOT"

branch="$(git branch --show-current)"
head="$(git rev-parse HEAD)"

if [[ "$branch" != "$EXPECTED_BRANCH" ]]; then
  echo "ERROR: expected branch $EXPECTED_BRANCH, found ${branch:-detached}" >&2
  exit 1
fi

if [[ "$head" != "$EXPECTED_HEAD" ]]; then
  echo "ERROR: expected HEAD $EXPECTED_HEAD, found $head" >&2
  echo "This acceptance harness is pinned to the billing-hardening commit." >&2
  exit 1
fi

for cmd in stripe pnpm lsof; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERROR: missing command: $cmd" >&2
    if [[ "$cmd" == "stripe" ]]; then
      echo "Install/login with Stripe CLI before running this suite." >&2
    fi
    exit 1
  }
done

if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ERROR: port 3000 is already in use." >&2
  echo "Stop the existing local Web dev server; the billing suite starts its own isolated Web process." >&2
  exit 1
fi

echo "=== REPOSITORY ==="
git log -1 --oneline
git status --short

echo
echo "=== STRIPE CLI ==="
stripe --version

cd "$WEB"

echo
echo "=== TEST-MODE PREFLIGHT ==="
preflight_output="$(
  pnpm exec tsx \
    scripts/billing-acceptance/preflight.ts
)"
printf '%s\n' "$preflight_output"

marker="$(
  printf '%s\n' "$preflight_output" |
    grep '^__ZOESKOUL_BILLING_PREFLIGHT__=' |
    tail -1
)"

if [[ -z "$marker" ]]; then
  echo "ERROR: billing preflight marker missing." >&2
  exit 1
fi

monthly_price_id="$(
  printf '%s\n' "$marker" |
    sed -E 's/.*"monthlyPriceId":"([^"]+)".*/\1/'
)"

if [[ -z "$monthly_price_id" || "$monthly_price_id" == "$marker" ]]; then
  echo "ERROR: could not parse test monthly price ID." >&2
  exit 1
fi

echo
echo "=== STRIPE CLI ACCOUNT ALIGNMENT ==="
cli_price="$(
  stripe prices retrieve "$monthly_price_id"
)"
printf '%s\n' "$cli_price" |
  grep -Eq '"livemode"[[:space:]]*:[[:space:]]*false' || {
    echo "ERROR: Stripe CLI did not retrieve the configured sandbox price." >&2
    echo "Run 'stripe login' for the same Stripe account used by the app test key." >&2
    exit 1
  }
echo "Stripe CLI can retrieve the app's configured sandbox price."

tmp_dir="$(mktemp -d /tmp/zoeskoul-billing-stripe.XXXXXX)"
listener_log="$tmp_dir/stripe-listen.log"
listener_pid=""

cleanup() {
  status=$?

  if [[ -n "$listener_pid" ]] && kill -0 "$listener_pid" 2>/dev/null; then
    kill "$listener_pid" 2>/dev/null || true
    wait "$listener_pid" 2>/dev/null || true
  fi

  if [[ "$status" -ne 0 ]]; then
    echo
    echo "Billing acceptance failed."
    echo "Stripe listener log preserved at:"
    echo "  $listener_log"
  else
    rm -rf "$tmp_dir"
  fi

  exit "$status"
}
trap cleanup EXIT INT TERM

events="$(
  cat <<'EOF'
checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,customer.subscription.pending_update_applied,customer.subscription.pending_update_expired,customer.subscription.trial_will_end,invoice.created,invoice.finalized,invoice.finalization_failed,invoice.paid,invoice.payment_succeeded,invoice.payment_failed,invoice.payment_action_required,invoice.marked_uncollectible,invoice.voided,customer.deleted
EOF
)"

echo
echo "=== START SIGNED STRIPE WEBHOOK FORWARDER ==="
stripe listen \
  --events "$events" \
  --forward-to \
  http://localhost:3000/api/stripe/webhook \
  >"$listener_log" 2>&1 &
listener_pid=$!

webhook_secret=""
for _ in $(seq 1 120); do
  if ! kill -0 "$listener_pid" 2>/dev/null; then
    echo "ERROR: stripe listen exited before becoming ready." >&2
    cat "$listener_log" >&2
    exit 1
  fi

  webhook_secret="$(
    grep -Eo 'whsec_[A-Za-z0-9]+' "$listener_log" |
      head -1 || true
  )"

  if [[ -n "$webhook_secret" ]]; then
    break
  fi

  sleep 0.25
done

if [[ -z "$webhook_secret" ]]; then
  echo "ERROR: could not obtain Stripe CLI webhook signing secret." >&2
  cat "$listener_log" >&2
  exit 1
fi

export E2E_STRIPE_WEBHOOK_SECRET="$webhook_secret"

echo "Stripe webhook forwarder ready."

echo
echo "=== BILLING ACCEPTANCE ==="
pnpm exec playwright test \
  --config playwright.billing.config.ts \
  --workers=1

echo
echo "=== ACCEPTANCE RESULT ==="
echo "Billing Stripe acceptance passed."
echo
echo "Covered:"
echo "  ✓ new paid Checkout"
echo "  ✓ same-attempt Stripe idempotency/recovery"
echo "  ✓ rapid duplicate UI click"
echo "  ✓ two-tab reservation race"
echo "  ✓ cancel-return preserves Checkout + Resume/Switch UI"
echo "  ✓ real checkout.session.expired via Stripe CLI"
echo "  ✓ real signed CLI trigger into durable webhook ledger"
echo "  ✓ real Stripe trial subscription + signed webhook reconciliation"
echo "  ✓ trialUsedAt persistence + second-trial rejection"
echo "  ✓ real Stripe paid subscription + signed webhook reconciliation"
echo "  ✓ repeated subscription update reconciliation stays idempotent"
echo
echo "Manual release smoke still required:"
echo "  - complete one hosted Stripe Checkout in a real browser"
echo "  - complete CAPTCHA if Stripe presents it"
echo "  - verify redirect to /billing/success"
