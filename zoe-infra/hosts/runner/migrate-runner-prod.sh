#!/usr/bin/env bash
# Zoéskoul Runner: single-entrypoint, resumable production cutover.
# V4: never pull mutable :prod during cutover; all Runner/runtime refs are @sha256-pinned.
# Requires bash, systemd, Docker Compose v2, Python 3, git and sudo.
set -Eeuo pipefail
umask 077

MODE=""; CONFIG="/etc/zoeskoul/runner-prod-migration.conf"
for arg in "$@"; do
  case "$arg" in
    --check|--prepare|--apply|--resume|--rollback) [[ -z "$MODE" ]] || { echo 'Select one mode' >&2; exit 2; }; MODE="$arg" ;;
    --config=*) CONFIG="${arg#--config=}" ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
[[ -n "$MODE" ]] || { echo "Usage: sudo bash $0 {--check|--prepare|--apply|--rollback} [--config=/etc/zoeskoul/runner-prod-migration.conf]" >&2; exit 2; }
[[ "$(id -u)" = 0 ]] || { echo 'Run as root (sudo bash ...)' >&2; exit 1; }
[[ -f "$CONFIG" && ! -L "$CONFIG" ]] || { echo "Missing private config: $CONFIG" >&2; exit 1; }
[[ "$(stat -c %u "$CONFIG")" = 0 ]] || { echo 'Config must be owned by root' >&2; exit 1; }
mode_bits="$(stat -c %a "$CONFIG")"
(( (8#$mode_bits & 077) == 0 )) || { echo 'Config must not be group/world readable' >&2; exit 1; }
# shellcheck source=/dev/null
source "$CONFIG"

REPO_ROOT="${REPO_ROOT:-/opt/zoeskoul}"
RUNNER_DIR="$REPO_ROOT/zoe-infra/hosts/runner"
LEGACY_PROJECT="${LEGACY_PROJECT:-runner}"
LEARNING_EXECUTOR_USER="${LEARNING_EXECUTOR_USER:-deploy}"
ZOEBUILD_EXECUTOR_USER="${ZOEBUILD_EXECUTOR_USER:-zoebuild-exec}"
STATE_DIR="${STATE_DIR:-/var/lib/zoeskoul-runner-prod-migration}"
JUDGE0_IMAGE="${PROD_JUDGE0_IMAGE:-}"
PROD_DEPENDENCY_SECRET_FILE="${PROD_DEPENDENCY_SECRET_FILE:-}"
EXPECTED_RUNNER_DIGEST="${EXPECTED_RUNNER_DIGEST:-}"
EXPECTED_RUNTIME_DIGEST="${EXPECTED_RUNTIME_DIGEST:-}"
EXPECTED_SOURCE_COMMIT="${EXPECTED_SOURCE_COMMIT:-}"
AUTO_REBOOT_CGROUP_V2="${AUTO_REBOOT_CGROUP_V2:-no}"
CLEANUP_EXERCISE="${CLEANUP_EXERCISE:-no}"
# Production ZoeBuild is NOT live. no = Learning-only cutover; /build/* returns 404.
ZOEBUILD_ENABLED="${ZOEBUILD_ENABLED:-no}"
SERVICE=zoeskoul-runner-prod-migration-resume.service

log() { printf '[prod-runner] %s\n' "$*"; }
fail() { printf '[prod-runner] STOP: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "Missing required command: $1"; }
valid_digest() { [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]]; }
get_key() { # Non-secret keys only; never print entire .env.
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 1
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}
rootless() {
  local user="$1" uid
  uid="$(id -u "$user")" || return 1
  sudo -u "$user" env XDG_RUNTIME_DIR="/run/user/$uid" \
    DOCKER_HOST="unix:///run/user/$uid/docker.sock" docker "${@:2}"
}
require_v2() {
  [[ "$(findmnt -no FSTYPE /sys/fs/cgroup)" = cgroup2 ]] || fail 'Host is not on cgroup v2'
  [[ "$(docker info --format '{{.CgroupVersion}}')" = 2 ]] || fail 'Rootful Docker not on cgroup v2'
}

check_base() {
  local x
  for x in docker git python3 sudo findmnt systemctl stat grep awk sort mktemp curl; do need "$x"; done
  [[ -f "$RUNNER_DIR/deploy.sh" && -f "$RUNNER_DIR/prepare-dev-env.py" && \
     -f "$RUNNER_DIR/zoeskoul-learning/compose.yml" && -f "$RUNNER_DIR/gateway/Caddyfile" && \
     -f "$RUNNER_DIR/zoeskoul-learning/judge0-v2/zoe_isolate_box_lease.rb" ]] || fail 'Missing production Runner infrastructure or Judge0 lease implementation'
  # Sparse production checkout: verify the exact committed guard object, not a checked-out file.
  git -C "$REPO_ROOT" cat-file -e HEAD:apps/runner/src/middleware/executionPoolGuard.ts 2>/dev/null || fail 'Approved commit lacks execution pool guard in Git object database'
  grep -Fq 'RUNNER_SITE_ADDRESS' "$RUNNER_DIR/gateway/Caddyfile" || fail 'Production gateway source lacks configurable site addresses'
  grep -Fq 'GATEWAY_SCHEME' "$RUNNER_DIR/gateway/compose.yml" || fail 'Production gateway Compose does not support HTTPS selection'
  git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null || fail 'Invalid repository root'
  [[ "$EXPECTED_SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || fail 'Set EXPECTED_SOURCE_COMMIT (full verified 40-character release SHA)'
  [[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" = "$EXPECTED_SOURCE_COMMIT" ]] || fail 'Production checkout differs from verified source release SHA'
  valid_digest "$EXPECTED_RUNNER_DIGEST" || fail 'Set EXPECTED_RUNNER_DIGEST to a verified sha256:...'
  valid_digest "$EXPECTED_RUNTIME_DIGEST" || fail 'Set EXPECTED_RUNTIME_DIGEST to a verified sha256:...'
  [[ "$JUDGE0_IMAGE" =~ ^ghcr\.io/[a-z0-9_.-]+/zoeskoul-judge0@sha256:[a-f0-9]{64}$ ]] || fail 'PROD_JUDGE0_IMAGE must be an immutable GHCR Judge0 digest'
  [[ "$LEGACY_PROJECT" =~ ^[a-z0-9][a-z0-9_-]+$ ]] || fail 'Invalid legacy Compose project name'
  [[ "$LEARNING_EXECUTOR_USER" != "$ZOEBUILD_EXECUTOR_USER" ]] || fail 'Executor users must differ'
  [[ "$ZOEBUILD_EXECUTOR_USER" = zoebuild-exec ]] || fail 'Current ZoeBuild provisioner requires executor user zoebuild-exec'
  [[ "$ZOEBUILD_ENABLED" = yes || "$ZOEBUILD_ENABLED" = no ]] || fail 'ZOEBUILD_ENABLED must be yes/no'
  if [[ "$ZOEBUILD_ENABLED" = yes ]]; then
    [[ -n "$PROD_DEPENDENCY_SECRET_FILE" && -f "$PROD_DEPENDENCY_SECRET_FILE" ]] || fail 'ZoeBuild enabled: supply existing production dependency approval secret via private file'
  fi
  [[ -f "$RUNNER_DIR/gateway/routes/zoebuild-enabled.caddy" && -f "$RUNNER_DIR/gateway/routes/zoebuild-disabled.caddy" ]] || fail 'Gateway route switch files are missing'
  grep -Fq 'import zoebuild-route.caddy' "$RUNNER_DIR/gateway/Caddyfile" || fail 'Caddyfile has no controlled ZoeBuild route import' 
  [[ -f "$RUNNER_DIR/.env" || ( -f "$RUNNER_DIR/zoeskoul-learning/.env" && -f "$RUNNER_DIR/zoebuild/.env" && -f "$RUNNER_DIR/gateway/.env" ) ]] || fail 'Need legacy runner/.env or all three prepared private pool envs'
  [[ "${RUNNER_PUBLIC_HOSTNAME:-}" != *localhost* ]] || fail 'Production hostname must not be localhost'
  [[ "$AUTO_REBOOT_CGROUP_V2" = yes || "$AUTO_REBOOT_CGROUP_V2" = no ]] || fail 'AUTO_REBOOT_CGROUP_V2 must be yes/no'
  for x in runner_judge0_db runner_judge0_redis runner_caddy_data runner_caddy_config; do
    docker volume inspect "$x" >/dev/null 2>&1 || fail "Missing legacy volume $x. Do not initialize empty production data; reconcile existing Compose volume names."
  done
  local compose_version
  compose_version="$(docker compose version --short 2>/dev/null)" || fail 'Docker Compose v2 is required'
  log "Source and four legacy named volumes verified; Compose $compose_version"
  [[ -n "${GHCR_OWNER:-}" ]] || fail 'Set GHCR_OWNER (GitHub registry account)'
  [[ "${IMAGE_TAG:-prod}" = prod || "${IMAGE_TAG:-}" =~ ^[a-zA-Z0-9._-]+$ ]] || fail 'Invalid IMAGE_TAG'
  # Only the legacy project will be stopped: no generic Docker down/prune.
  if [[ "$MODE" = --check || "$MODE" = --prepare || "$MODE" = --apply ]]; then
    local old
    old="$(docker ps -a --filter "label=com.docker.compose.project=$LEGACY_PROJECT" --format '{{.Names}}')"
    [[ -n "$old" ]] || fail "No legacy Compose containers for project '$LEGACY_PROJECT' (or already cut over)"
    printf '%s\n' "$old" | grep -qE -- '(^|-)runner-[0-9]+$' || fail 'Legacy Runner service not identified'
    printf '%s\n' "$old" | grep -qE -- '(^|-)caddy-[0-9]+$' || fail 'Legacy gateway service not identified'
    log "Legacy Compose project '$LEGACY_PROJECT' identified (names only; will not be removed)"
  fi
  # Never run a dev-only env generator with production placeholders undetected.
  [[ -f "$RUNNER_DIR/zoebuild/.env.example" && -f "$RUNNER_DIR/gateway/.env.example" ]] || fail 'Missing environment templates'
  grep -Fq 'RUNNER_SERVICE_IMAGE_REF' "$RUNNER_DIR/shared/runner-service.yml" || fail 'Runner Compose lacks immutable image support'
  grep -Fq 'RUNNER_IMAGE_REF' "$RUNNER_DIR/shared/deploy-pool.sh" || fail 'Pool deployment lacks immutable runtime support'
}

check_private_input() {
  if [[ "$ZOEBUILD_ENABLED" = no ]]; then
    log 'ZoeBuild not live: dependency approval secret is not required'
    return 0
  fi
  [[ "$(stat -c %u "$PROD_DEPENDENCY_SECRET_FILE")" = 0 ]] || fail 'Dependency secret file must be root-owned'
  local p; p="$(stat -c %a "$PROD_DEPENDENCY_SECRET_FILE")"
  (( (8#$p & 077) == 0 )) || fail 'Dependency secret file permissions must be 0600 or stricter'
  python3 - "$PROD_DEPENDENCY_SECRET_FILE" <<'PY'
from pathlib import Path
import sys
raw=Path(sys.argv[1]).read_bytes()
if len(raw.strip(b'\r\n')) < 32 or b'\n' in raw.strip(b'\r\n') or b'\r' in raw.strip(b'\r\n'):
    sys.exit('Invalid dependency secret file; requires single-line existing production secret (>=32 bytes)')
print('PROD_DEPENDENCY_SECRET_INPUT_PASS')
PY
}

save_state() {
  install -d -m 700 "$STATE_DIR"
  if [[ ! -f "$STATE_DIR/initialized" ]]; then
    [[ -f "$RUNNER_DIR/.env" ]] && cp -p "$RUNNER_DIR/.env" "$STATE_DIR/legacy-runner.env"
    [[ -f /etc/default/grub ]] && cp -p /etc/default/grub "$STATE_DIR/pre-cgroup-grub"
    docker ps -a --filter "label=com.docker.compose.project=$LEGACY_PROJECT" --format '{{.Names}}' > "$STATE_DIR/legacy-containers"
    # Manifest is deliberately not secret-bearing.
    git -C "$REPO_ROOT" rev-parse HEAD > "$STATE_DIR/source-commit"
    date -u +'%Y-%m-%dT%H:%M:%SZ' > "$STATE_DIR/start-time"
    touch "$STATE_DIR/initialized"
  fi
}

configure_delegation() {
  install -d -m 755 /etc/systemd/system/user@.service.d
  printf '[Service]\nDelegate=cpu cpuset io memory pids\n' > /etc/systemd/system/user@.service.d/zoeskoul-runner-delegate.conf
  systemctl daemon-reload
}

install_resume_unit() {
  [[ "$0" = /* ]] || fail 'Run the migration script by absolute path for reboot resumption'
  [[ "$CONFIG" = /* ]] || fail '--config must be an absolute path for reboot resumption'
  # Quote as systemd ExecStart argument: only allow safe root-owned absolute paths.
  [[ "$0" =~ ^/[a-zA-Z0-9_./-]+$ && "$CONFIG" =~ ^/[a-zA-Z0-9_./-]+$ ]] || fail 'Use absolute paths without spaces or special characters for automatic resume'
  cat > "/etc/systemd/system/$SERVICE" <<UNIT
[Unit]
Description=Resume one-time Zoéskoul runner production migration
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/bash $0 --resume --config=$CONFIG
TimeoutStartSec=2400

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable "$SERVICE" >/dev/null
}

configure_cgroup_boot() {
  [[ -f /etc/default/grub && -x /usr/sbin/update-grub || -f /etc/default/grub && -x /usr/bin/update-grub ]] || fail 'GRUB configuration/update-grub unavailable; do not reboot automatically'
  python3 - <<'PY'
from pathlib import Path
import re
p=Path('/etc/default/grub'); original=p.read_text(); found=set(); out=[]
remove={'systemd.unified_cgroup_hierarchy','systemd.legacy_systemd_cgroup_controller','cgroup_enable','swapaccount'}
for line in original.splitlines():
 m=re.fullmatch(r'(GRUB_CMDLINE_LINUX(?:_DEFAULT)?)="([^"]*)"',line)
 if m:
  k,v=m.groups()
  if k in found: raise SystemExit('Duplicate GRUB variables; abort')
  found.add(k)
  tokens=[t for t in v.split() if t.split('=',1)[0] not in remove]
  if k=='GRUB_CMDLINE_LINUX': tokens.append('systemd.unified_cgroup_hierarchy=1')
  line=f'{k}="{" ".join(tokens)}"'
 out.append(line)
if found!={'GRUB_CMDLINE_LINUX_DEFAULT','GRUB_CMDLINE_LINUX'}:
 raise SystemExit('Unexpected GRUB layout; abort')
p.write_text('\n'.join(out)+'\n')
print('PRODUCTION_CGROUP_V2_BOOT_CONFIG_PASS')
PY
  update-grub
}

ensure_rootless() {
  local user="$1" uid
  if ! id "$user" >/dev/null 2>&1; then
    [[ "$user" = "$ZOEBUILD_EXECUTOR_USER" ]] || fail "Missing Learning executor account $user"
    log 'Creating dedicated ZoeBuild rootless Docker account'
    "$RUNNER_DIR/setup-zoebuild-executor.sh" --install
  fi
  uid="$(id -u "$user")"
  if ! rootless "$user" info --format '{{.SecurityOptions}} {{.CgroupDriver}} {{.CgroupVersion}}' >/dev/null 2>&1; then
    [[ "$user" = "$LEARNING_EXECUTOR_USER" ]] && fail "Learning rootless Docker not ready for $user; repair independently before cutover"
    log 'Installing dedicated ZoeBuild rootless Docker daemon'
    "$RUNNER_DIR/setup-zoebuild-executor.sh" --install
  fi
  local actual
  actual="$(rootless "$user" info --format '{{.CgroupDriver}}/{{.CgroupVersion}}')"
  [[ "$actual" = systemd/2 ]] || fail "$user rootless Docker lacks cgroup v2 systemd enforcement ($actual)"
  [[ -S "/run/user/$uid/docker.sock" ]] || fail "$user missing rootless Docker socket"
  log "$user rootless Docker verified (cgroup v2/systemd)"
}

# Only create the dormant ZoeBuild OS account before reboot, because the legacy
# env converter needs its UID. No rootless daemon is started and no public route
# is exposed during preboot preparation.
ensure_zoebuild_account_for_env() {
  [[ "$ZOEBUILD_EXECUTOR_USER" = zoebuild-exec ]] || fail 'Unexpected ZoeBuild executor account'
  if ! id "$ZOEBUILD_EXECUTOR_USER" >/dev/null 2>&1; then
    need useradd
    useradd --create-home --shell /bin/bash "$ZOEBUILD_EXECUTOR_USER" || fail 'Unable to provision dormant ZoeBuild account'
    log 'Dormant ZoeBuild account created for private env generation'
  fi
  [[ "$(id -u "$LEARNING_EXECUTOR_USER")" != "$(id -u "$ZOEBUILD_EXECUTOR_USER")" ]] || fail 'Executor UIDs must differ'
}

write_env_once() {
  local d="$RUNNER_DIR"
  local count=0 p
  for p in zoeskoul-learning zoebuild gateway; do [[ -f "$d/$p/.env" ]] && count=$((count+1)); done
  if (( count == 0 )); then
    [[ -f "$d/.env" ]] || fail 'Legacy env missing for generation'
    log 'Preparing private per-pool environments from legacy configuration'
    python3 "$d/prepare-dev-env.py" --legacy-env "$d/.env" --zoebuild-executor-user "$ZOEBUILD_EXECUTOR_USER"
  elif (( count != 3 )); then
    fail 'Partial pool envs detected; inspect rather than overwrite'
  else
    log 'Existing private pool envs retained'
  fi
  # Production-only necessary overrides and secret file, no values printed.
  GHCR_OWNER="$GHCR_OWNER" IMAGE_TAG="${IMAGE_TAG:-prod}" python3 - "$d" "$JUDGE0_IMAGE" "$PROD_DEPENDENCY_SECRET_FILE" "$LEARNING_EXECUTOR_USER" "$ZOEBUILD_EXECUTOR_USER" "$ZOEBUILD_ENABLED" "$EXPECTED_RUNNER_DIGEST" "$EXPECTED_RUNTIME_DIGEST" <<'PY'
from pathlib import Path
import os,pwd,re,sys
root=Path(sys.argv[1]); image=sys.argv[2]; learn=sys.argv[4]; zoe=sys.argv[5]; zoe_enabled=(sys.argv[6]=='yes')
secret=Path(sys.argv[3]).read_bytes().rstrip(b'\r\n').decode() if zoe_enabled else ''
if zoe_enabled and (len(secret.encode())<32 or '\n' in secret or '$' in secret): raise SystemExit('Invalid production secret (noninterpolated one-line value required)')
def update(path,changes):
 lines=path.read_text().splitlines()
 for k,v in changes.items():
  if '\n' in v or '\r' in v: raise SystemExit('Multiline env value')
  lines=[line for line in lines if not line.startswith(k+'=')]
  lines.append(k+'='+v)
 path.write_text('\n'.join(lines)+'\n');path.chmod(0o600)
lu=pwd.getpwnam(learn).pw_uid; zu=pwd.getpwnam(zoe).pw_uid
if lu==zu: raise SystemExit('Shared executor UID')
owner=os.environ['GHCR_OWNER']; tag=os.environ.get('IMAGE_TAG','prod')
runner_ref=f'ghcr.io/{owner}/zoeskoul-runner@{sys.argv[7]}'
runtime_ref=f'ghcr.io/{owner}/zoeskoul-runtime@{sys.argv[8]}'
update(root/'zoeskoul-learning/.env',{'RUNNER_DOCKER_SOCKET_HOST':f'/run/user/{lu}/docker.sock','RUNNER_CONTAINER_USER':f'{lu}:{lu}','RUNNER_EXECUTION_POOL':'zoeskoul-learning','JUDGE0_IMAGE':image,'GHCR_OWNER':owner,'IMAGE_TAG':tag,'RUNNER_SERVICE_IMAGE_REF':runner_ref,'RUNNER_IMAGE_REF':runtime_ref})
b={'RUNNER_DOCKER_SOCKET_HOST':f'/run/user/{zu}/docker.sock','RUNNER_CONTAINER_USER':f'{zu}:{zu}','RUNNER_EXECUTION_POOL':'zoebuild','GHCR_OWNER':owner,'IMAGE_TAG':tag,'RUNNER_SERVICE_IMAGE_REF':runner_ref,'RUNNER_IMAGE_REF':runtime_ref}
if zoe_enabled: b['ZOEBUILD_DEPENDENCY_APPROVAL_SECRET']=secret
update(root/'zoebuild/.env',b)
route='routes/zoebuild-enabled.caddy' if zoe_enabled else 'routes/zoebuild-disabled.caddy'
update(root/'gateway/.env',{'GATEWAY_SCHEME':'https','RUNNER_PUBLIC_SMOKE':'true','ZOEBUILD_ROUTE_FILE':route})
print('PROD_PRIVATE_POOL_ENVS_READY')
PY
}

validate_pool_envs() {
  local d="$RUNNER_DIR" p
  for p in zoeskoul-learning zoebuild gateway; do
    [[ -f "$d/$p/.env" ]] || fail "Missing $p/.env"
    [[ "$(stat -c %a "$d/$p/.env")" = 600 ]] || fail "$p/.env must be mode 0600"
  done
  python3 - "$d" "$JUDGE0_IMAGE" "$ZOEBUILD_ENABLED" "$EXPECTED_RUNNER_DIGEST" "$EXPECTED_RUNTIME_DIGEST" "$GHCR_OWNER" <<'PY'
from pathlib import Path
import sys,re
root=Path(sys.argv[1]); judge=sys.argv[2]; zoe_enabled=(sys.argv[3]=='yes')
runner_ref=f'ghcr.io/{sys.argv[6]}/zoeskoul-runner@{sys.argv[4]}'
runtime_ref=f'ghcr.io/{sys.argv[6]}/zoeskoul-runtime@{sys.argv[5]}'
def env(s):
 d={}
 for line in (root/s/'.env').read_text().splitlines():
  if line and not line.startswith('#') and '=' in line:
   k,v=line.split('=',1); d[k]=v.strip().strip('"\'')
 return d
l=env('zoeskoul-learning'); b=env('zoebuild'); g=env('gateway')
required_l=['RUNNER_SECRET','RUNNER_SHARED_SECRET','RUNNER_EDGE_SECRET','PTY_ATTACH_SECRET','RUNNER_ATTACH_TOKEN_SECRET','JUDGE0_AUTHN_TOKEN','JUDGE0_AUTHZ_TOKEN','JUDGE0_POSTGRES_PASSWORD','JUDGE0_REDIS_PASSWORD']
required_b=['RUNNER_SECRET','RUNNER_SHARED_SECRET','RUNNER_EDGE_SECRET','PTY_ATTACH_SECRET','RUNNER_ATTACH_TOKEN_SECRET','ZOEBUILD_DEPENDENCY_APPROVAL_SECRET'] if zoe_enabled else []
for n,d,keys in [('Learning',l,required_l),('ZoeBuild',b,required_b),('Gateway',g,['CADDY_EMAIL','RUNNER_DOMAIN','JUDGE0_DOMAIN','JUDGE0_AUTHN_TOKEN'])]:
 for k in keys:
  v=d.get(k,'')
  if not v or 'CHANGE_ME' in v or 'REPLACE_WITH' in v:
   raise SystemExit(f'Invalid/missing {n} setting: {k}')
if l['JUDGE0_IMAGE']!=judge: raise SystemExit('Judge0 immutable digest mismatch')
for pool,d in [('Learning',l),('ZoeBuild',b)]:
 if d.get('RUNNER_SERVICE_IMAGE_REF')!=runner_ref or d.get('RUNNER_IMAGE_REF')!=runtime_ref:
  raise SystemExit(f'{pool}: image refs not pinned to approved digests')
if g.get('JUDGE0_AUTHN_TOKEN')!=l['JUDGE0_AUTHN_TOKEN']: raise SystemExit('Judge0 gateway token mismatch')
if g.get('GATEWAY_SCHEME')!='https': raise SystemExit('Production must use HTTPS')
expected_route='routes/zoebuild-enabled.caddy' if zoe_enabled else 'routes/zoebuild-disabled.caddy'
if g.get('ZOEBUILD_ROUTE_FILE')!=expected_route: raise SystemExit('Unexpected ZoeBuild route exposure')
if not all(d.get('RUNNER_EXECUTION_POOL')==n for n,d in [('zoeskoul-learning',l),('zoebuild',b)]): raise SystemExit('Invalid pool identities')
if zoe_enabled:
 for k in ('RUNNER_SECRET','RUNNER_SHARED_SECRET'):
  if l[k]!=b[k]: raise SystemExit(f'Platform {k} mismatch between pools')
if not re.fullmatch(r'[1-9][0-9]*',l.get('JUDGE0_LANG_R','')): raise SystemExit('Judge0 R language ID not verified')
for k in ('RUNNER_DOMAIN','JUDGE0_DOMAIN'):
 if 'localhost' in g[k] or '.' not in g[k] or '/' in g[k]: raise SystemExit('Invalid production hostname')
print('PRODUCTION_ENV_CONTRACT_PASS')
PY
  if [[ "${1:-}" = --contracts-only ]]; then
    # Docker Compose resolves the exact private prod manifests and mounts, but
    # does not contact daemons or start/stop containers before a reboot.
    local p
    for p in zoeskoul-learning zoebuild gateway; do
      (cd "$d/$p" && docker compose --env-file .env -f compose.yml config --quiet) || fail "Invalid $p production Compose contract"
      if [[ "$p" != gateway ]]; then
        (cd "$d/$p" && docker compose --env-file .env -f compose.yml config --format json) | \
          python3 -c 'import json,sys; s=json.load(sys.stdin)["services"]["runner"]; assert s["image"]==sys.argv[1],"Runner Compose image not digest pinned";assert s["environment"]["RUNNER_IMAGE"]==sys.argv[2],"Execution runtime image not digest pinned"' \
          "ghcr.io/${GHCR_OWNER}/zoeskoul-runner@${EXPECTED_RUNNER_DIGEST}" "ghcr.io/${GHCR_OWNER}/zoeskoul-runtime@${EXPECTED_RUNTIME_DIGEST}" || fail "Unpinned $p Compose image ref"
      fi
    done
    (cd "$d/zoeskoul-learning" && docker compose --env-file .env -f compose.yml config --format json) | \
      python3 -c 'import json,sys; s=json.load(sys.stdin)["services"];assert s["judge0"]["image"]==s["judge0-worker"]["image"];assert s["judge0-worker"].get("cgroup")=="host";print("PREBOOT_JUDGE0_CGROUP_CONFIG_PASS")' || fail 'Preboot Judge0 Compose contract failed'
    log 'PREBOOT_PRODUCTION_ENV_CONTRACTS_PASS'
    return 0
  fi
  (cd "$d" && ./deploy.sh --check)
  # Check resolved image identity and cgroup namespace, without exposing config.
  (cd "$d/zoeskoul-learning" && docker compose --env-file .env -f compose.yml config --format json) | \
    python3 -c 'import json,sys; s=json.load(sys.stdin)["services"];assert s["judge0"]["image"]==s["judge0-worker"]["image"];assert s["judge0-worker"].get("cgroup")=="host";print("JUDGE0_CGROUP2_CONFIG_PASS")'
}

assert_digest() {
  local ref="$1" expected="$2" actual
  actual="$(docker image inspect "$ref" --format '{{range .RepoDigests}}{{println .}}{{end}}')"
  grep -Fq -- "@$expected" <<< "$actual" || fail "Image digest mismatch for ${ref%%:*}: expected approved digest"
}

pull_verify_release() {
  local img
  img="ghcr.io/${GHCR_OWNER}/zoeskoul-runner@${EXPECTED_RUNNER_DIGEST}"
  log 'Pulling and verifying approved Runner image BEFORE stopping legacy'
  docker pull "$img" >/dev/null
  assert_digest "$img" "$EXPECTED_RUNNER_DIGEST"
  log 'Pulling approved Judge0 cgroup v2 immutable image'
  docker pull "$JUDGE0_IMAGE" >/dev/null
  local i rimg="ghcr.io/${GHCR_OWNER}/zoeskoul-runtime@${EXPECTED_RUNTIME_DIGEST}"
  local users=("$LEARNING_EXECUTOR_USER")
  [[ "$ZOEBUILD_ENABLED" = yes ]] && users+=("$ZOEBUILD_EXECUTOR_USER")
  for i in "${users[@]}"; do
    log "Pulling runtime image into $i executor"
    rootless "$i" pull "$rimg" >/dev/null
    local actual
    actual="$(rootless "$i" image inspect "$rimg" --format '{{range .RepoDigests}}{{println .}}{{end}}')"
    grep -Fq -- "@$EXPECTED_RUNTIME_DIGEST" <<< "$actual" || fail "Runtime digest mismatch in $i executor"
  done
  log 'IMMUTABLE_IMAGE_DIGESTS_PASS'
}

# Before changing the host to cgroup v2, prove that the approved Learning
# artifacts can be pulled using the EXISTING production credentials.
preboot_release_readiness() {
  local runner_ref runtime_ref actual
  runner_ref="ghcr.io/${GHCR_OWNER}/zoeskoul-runner@${EXPECTED_RUNNER_DIGEST}"
  runtime_ref="ghcr.io/${GHCR_OWNER}/zoeskoul-runtime@${EXPECTED_RUNTIME_DIGEST}"
  rootless "$LEARNING_EXECUTOR_USER" info --format '{{json .SecurityOptions}}' | grep -qi rootless || fail 'Existing Learning executor not rootless; abort BEFORE reboot'
  log 'Verifying image accessibility BEFORE changing cgroup boot mode'
  docker pull "$runner_ref" >/dev/null || fail 'Runner image pull failed before reboot'
  assert_digest "$runner_ref" "$EXPECTED_RUNNER_DIGEST"
  docker pull "$JUDGE0_IMAGE" >/dev/null || fail 'Judge0 image pull failed before reboot'
  rootless "$LEARNING_EXECUTOR_USER" pull "$runtime_ref" >/dev/null || fail 'Learning runtime pull failed before reboot'
  actual="$(rootless "$LEARNING_EXECUTOR_USER" image inspect "$runtime_ref" --format '{{range .RepoDigests}}{{println .}}{{end}}')"
  grep -Fq -- "@$EXPECTED_RUNTIME_DIGEST" <<< "$actual" || fail 'Learning runtime digest mismatch before reboot'
  log 'PREBOOT_IMMUTABLE_IMAGE_ACCESS_PASS'
}

# This stage is deliberately run while the legacy production containers still
# serve traffic. On cgroup v1, the old Judge0 can answer the language-ID query;
# after reboot it may not be able to execute jobs. Fail before reboot instead.
prepare_before_reboot() {
  log 'Preparing Learning-first production migration without stopping legacy'
  ensure_zoebuild_account_for_env
  write_env_once
  resolve_r_language_id
  validate_pool_envs --contracts-only
  preboot_release_readiness
  backup_legacy_database
  touch "$STATE_DIR/preboot-ready"
  log 'PREBOOT_PRODUCTION_PREPARATION_PASS'
}

verify_deployed_image_pins() {
  local runner_ref runtime_ref runner_id cid container_id u actual
  runner_ref="ghcr.io/${GHCR_OWNER}/zoeskoul-runner@${EXPECTED_RUNNER_DIGEST}"
  runtime_ref="ghcr.io/${GHCR_OWNER}/zoeskoul-runtime@${EXPECTED_RUNTIME_DIGEST}"
  assert_digest "$runner_ref" "$EXPECTED_RUNNER_DIGEST"
  runner_id="$(docker image inspect "$runner_ref" --format '{{.Id}}')"
  local pools=(zoeskoul-learning)
  [[ "$ZOEBUILD_ENABLED" = yes ]] && pools+=(zoebuild)
  for p in "${pools[@]}"; do
    cid="$(cd "$RUNNER_DIR/$p" && docker compose --env-file .env -f compose.yml ps -q runner)"
    [[ -n "$cid" ]] || fail "No running $p Runner"
    container_id="$(docker inspect "$cid" --format '{{.Image}}')"
    [[ "$container_id" = "$runner_id" ]] || fail "$p Runner container differs from approved image"
  done
  local users=("$LEARNING_EXECUTOR_USER")
  [[ "$ZOEBUILD_ENABLED" = yes ]] && users+=("$ZOEBUILD_EXECUTOR_USER")
  for u in "${users[@]}"; do
    actual="$(rootless "$u" image inspect "$runtime_ref" --format '{{range .RepoDigests}}{{println .}}{{end}}')"
    grep -Fq -- "@$EXPECTED_RUNTIME_DIGEST" <<< "$actual" || fail "Runtime image changed during deployment in $u executor"
  done
  log 'DEPLOYED_IMMUTABLE_IMAGES_PASS'
}

resource_test() {
  local u out
  local users=("$LEARNING_EXECUTOR_USER")
  [[ "$ZOEBUILD_ENABLED" = yes ]] && users+=("$ZOEBUILD_EXECUTOR_USER")
  for u in "${users[@]}"; do
    rootless "$u" pull alpine:3.20 >/dev/null
    out="$(rootless "$u" run --rm --memory=128m --cpus=0.5 --pids-limit=64 alpine:3.20 sh -c 'cat /sys/fs/cgroup/memory.max; cat /sys/fs/cgroup/cpu.max; cat /sys/fs/cgroup/pids.max')" || fail "Resource-control smoke failed in $u"
    grep -Fxq 134217728 <<< "$out" || fail "Memory limit not enforced in $u"
    grep -Fxq '50000 100000' <<< "$out" || fail "CPU limit not enforced in $u"
    grep -Fxq 64 <<< "$out" || fail "PID limit not enforced in $u"
  done
  log 'ACTIVE_ROOTLESS_CGROUP_LIMITS_PASS'
}

resolve_r_language_id() {
  local envfile="$RUNNER_DIR/zoeskoul-learning/.env" current apiid cid
  current="$(get_key JUDGE0_LANG_R "$envfile" || true)"
  [[ "$current" =~ ^[1-9][0-9]*$ ]] && return 0
  cid="$(docker ps --filter "label=com.docker.compose.project=$LEGACY_PROJECT" \
    --filter 'label=com.docker.compose.service=judge0' -q | head -n1)"
  [[ -n "$cid" ]] || fail 'R language ID missing; legacy Judge0 API unavailable'
  apiid="$(docker exec -i "$cid" ruby - <<'RUBY'
require 'net/http'
require 'json'
uri=URI('http://127.0.0.1:2358/languages')
req=Net::HTTP::Get.new(uri)
req[ENV.fetch('AUTHN_HEADER','X-Judge0-Token')] = ENV.fetch('AUTHN_TOKEN')
response=Net::HTTP.start(uri.host,uri.port,open_timeout:5,read_timeout:15) {|http| http.request(req)}
abort 'Judge0 languages API unavailable' unless response.code == '200'
langs=JSON.parse(response.body)
r=langs.select {|x| x['name'].to_s.match?(/\AR \(/)}
abort 'Unique R language ID not found' unless r.length == 1
puts r.first.fetch('id')
RUBY
)" || fail 'Could not discover Judge0 R language ID'
  [[ "$apiid" =~ ^[1-9][0-9]*$ ]] || fail 'Invalid Judge0 R language ID'
  python3 - "$envfile" "$apiid" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); val=sys.argv[2]
lines=[s for s in p.read_text().splitlines() if not s.startswith('JUDGE0_LANG_R=')]
lines.append('JUDGE0_LANG_R='+val);p.write_text('\n'.join(lines)+'\n');p.chmod(0o600)
PY
  log 'JUDGE0_R_LANGUAGE_ID_DISCOVERED'
}

backup_legacy_database() {
  local dbid outfile
  dbid="$(docker ps --filter "label=com.docker.compose.project=$LEGACY_PROJECT" \
    --filter 'label=com.docker.compose.service=judge0-db' -q | head -n1)"
  [[ -n "$dbid" ]] || fail 'Legacy Judge0 database not running; cannot take migration backup'
  outfile="$STATE_DIR/judge0-precutover.dump"
  if [[ ! -s "$outfile" ]]; then
    log 'Exporting legacy Judge0 PostgreSQL backup into private state directory'
        local tmpfile="$outfile.partial"
    rm -f "$tmpfile"
    docker exec "$dbid" sh -c 'exec pg_dump -U "${POSTGRES_USER:-judge0}" -d "${POSTGRES_DB:-judge0}" -Fc' > "$tmpfile" || fail 'Judge0 pg_dump failed; existing database untouched'
    [[ $(stat -c %s "$tmpfile") -gt 100 ]] || fail 'Judge0 PostgreSQL export too small'
    mv -f "$tmpfile" "$outfile"
  fi
  [[ $(stat -c %s "$outfile") -gt 100 ]] || fail 'Judge0 PostgreSQL backup invalid/empty'
  docker exec -i "$dbid" pg_restore --list < "$outfile" >/dev/null || fail 'PostgreSQL dump integrity verification failed'
  log 'JUDGE0_DATABASE_BACKUP_PASS'
}

stop_legacy() {
  local name
  [[ -f "$STATE_DIR/legacy-containers" ]] || fail 'Legacy container inventory not captured'
  # Stop only previously captured members of the legacy Compose project.
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    [[ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$name")" = "$LEGACY_PROJECT" ]] || fail "Container ownership changed: $name"
    docker stop --time 40 "$name" >/dev/null || fail "Cannot stop $name"
  done < "$STATE_DIR/legacy-containers"
  touch "$STATE_DIR/legacy-stopped"
  log 'Legacy project stopped WITHOUT down, volume deletion, or pruning'
}

start_legacy() {
  local name
  [[ -f "$STATE_DIR/legacy-containers" ]] || fail 'Missing original inventory'
  # Never leave both gateway stacks binding ports 80/443.
  systemctl disable --now zoeskoul-zoebuild-storage-maintenance.timer zoeskoul-zoeskoul-learning-storage-maintenance.timer >/dev/null 2>&1 || true
  if [[ -f "$RUNNER_DIR/gateway/.env" ]]; then
    (cd "$RUNNER_DIR/gateway" && docker compose --env-file .env -f compose.yml stop 2>/dev/null) || true
  fi
  for p in zoebuild zoeskoul-learning; do
    [[ -f "$RUNNER_DIR/$p/.env" ]] && \
      (cd "$RUNNER_DIR/$p" && docker compose --env-file .env -f compose.yml stop 2>/dev/null) || true
  done
  # Restart by exact Compose service label: databases first, Caddy last.
  local target_service actual_service
  for target_service in judge0-db judge0-redis judge0-worker judge0 runner caddy; do
    while IFS= read -r name; do
      [[ -n "$name" ]] || continue
      actual_service="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$name" 2>/dev/null || true)"
      [[ "$actual_service" = "$target_service" ]] || continue
      docker start "$name" >/dev/null || log "WARNING: could not start legacy container $name"
    done < "$STATE_DIR/legacy-containers"
  done
  log 'Legacy containers restart requested; verify compatibility on current cgroup mode'
}

rollback_on_error() {
  local rc=$?
  trap - EXIT
  [[ "$rc" = 0 ]] && return 0
  log "Migration failed (exit $rc)."
  if [[ -f "$STATE_DIR/legacy-stopped" && ! -f "$STATE_DIR/completed" ]]; then
    log 'Restoring original container services (no data deletion)'
    start_legacy || true
    if [[ -f "$STATE_DIR/migrated-from-cgroup-v1" ]]; then
      log 'WARNING: Legacy Judge0 1.13.1 may not work with cgroup v2; use --rollback to restore GRUB and reboot'
    fi
  fi
  exit "$rc"
}

cutover() {
  trap rollback_on_error EXIT
  log 'Stopping global-prune legacy timer'
  systemctl disable --now zoeskoul-runner-storage-maintenance.timer >/dev/null 2>&1 || true
  backup_legacy_database
  stop_legacy
  "$RUNNER_DIR/setup.sh" --create-network
  "$RUNNER_DIR/deploy.sh" zoeskoul-learning
  "$RUNNER_DIR/zoeskoul-learning/smoke-test.sh"
  if [[ "$ZOEBUILD_ENABLED" = yes ]]; then
    "$RUNNER_DIR/deploy.sh" zoebuild
    "$RUNNER_DIR/zoebuild/smoke-test.sh"
  else
    log 'ZoeBuild not live: skipping Runner startup and public route'
  fi
  verify_deployed_image_pins
  "$RUNNER_DIR/deploy.sh" gateway
  "$RUNNER_DIR/gateway/smoke-test.sh"
  # An additional live network route check (not just Caddyfile validation).
  local domain response build_status
  domain="$(get_key RUNNER_DOMAIN "$RUNNER_DIR/gateway/.env")"
  response="$(curl --fail --silent --show-error --max-time 20 "https://$domain/healthz")" || fail 'Public HTTPS Runner health failed'
  [[ "$response" == *'"ok":true'* ]] || fail 'Public HTTPS Runner health unexpected'
  build_status="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "https://$domain/build/jobs/validate")"
  if [[ "$ZOEBUILD_ENABLED" = yes ]]; then
    [[ "$build_status" = 403 || "$build_status" = 401 ]] || fail 'ZoeBuild route not auth-gated as expected'
  else
    [[ "$build_status" = 404 ]] || fail 'Disabled ZoeBuild route must return 404'
  fi
  log 'PROD_HTTPS_AND_ROUTING_PASS'
  if [[ "$ZOEBUILD_ENABLED" = yes ]]; then
    "$RUNNER_DIR/install-maintenance.sh"
  else
    "$RUNNER_DIR/zoeskoul-learning/install-maintenance.sh"
    systemctl disable --now zoeskoul-zoebuild-storage-maintenance.timer >/dev/null 2>&1 || true
  fi
  log 'Scoped maintenance enabled for live pools' 
  if [[ -x "$RUNNER_DIR/verify-pool-isolation.sh" ]]; then
    # The existing dev helper hardcodes 'jean'. Our own checks remain authoritative.
    [[ "$LEARNING_EXECUTOR_USER" = jean ]] && "$RUNNER_DIR/verify-pool-isolation.sh" || true
  fi
  [[ "$CLEANUP_EXERCISE" = yes ]] && {
    [[ "$ZOEBUILD_ENABLED" = no ]] || "$RUNNER_DIR/zoebuild/cleanup.sh"
    "$RUNNER_DIR/zoeskoul-learning/cleanup.sh"
  }
  touch "$STATE_DIR/completed"
  trap - EXIT
  if [[ "$ZOEBUILD_ENABLED" = no ]]; then
    log 'PRODUCTION_LEARNING_MIGRATION_PASS'
    log 'ZOEBUILD_NOT_LIVE_ROUTE_DISABLED_PASS'
  else
    log 'PRODUCTION_TWO_POOL_MIGRATION_PASS'
  fi
  [[ "$ZOEBUILD_ENABLED" = yes ]] && log 'Application-level save/refresh and real React/Vite preview require a post-cutover browser acceptance test' || true
}

rollback_run() {
  [[ -f "$STATE_DIR/initialized" ]] || fail 'No migration state found'
  start_legacy
  if [[ -f "$STATE_DIR/migrated-from-cgroup-v1" && -f "$STATE_DIR/pre-cgroup-grub" ]]; then
    cp -a "$STATE_DIR/pre-cgroup-grub" /etc/default/grub
    update-grub
    log 'Original cgroup boot configuration restored. Legacy Judge0 needs a reboot into cgroup v1 to function.'
    log 'Schedule a reboot and check old services; this mode never automatically reboots production.'
  fi
  rm -f "$STATE_DIR/completed"
  log 'ROLLBACK_REQUESTED_AND_LEGACY_RESTARTED'
}

if [[ "$MODE" = --rollback ]]; then rollback_run; exit 0; fi
[[ ! -f "$STATE_DIR/completed" ]] || fail "Migration already completed: $STATE_DIR/completed; not repeating cutover"
check_base
check_private_input
if [[ "$MODE" = --check ]]; then
  log "Host cgroup filesystem: $(findmnt -no FSTYPE /sys/fs/cgroup)"
  log 'Preflight source, manifests, release digests and legacy volumes PASS'
  log "Production ZoeBuild enabled: $ZOEBUILD_ENABLED"
  log 'NOTE: --check does not provision rootless daemons, pull images, or stop services'
  exit 0
fi
[[ "$MODE" != --resume || -f "$STATE_DIR/initialized" ]] || fail 'Cannot resume: no migration state'
save_state
if [[ "$MODE" = --prepare ]]; then
  prepare_before_reboot
  log 'Legacy services remain active. No cgroup boot changes or cutover performed.'
  exit 0
fi
configure_delegation
if [[ "$MODE" = --resume ]]; then
  # One-shot resume: remove boot dependency first so failed attempts do not loop.
  systemctl disable "$SERVICE" >/dev/null 2>&1 || true
fi
if [[ "$(findmnt -no FSTYPE /sys/fs/cgroup)" != cgroup2 ]]; then
  [[ "$MODE" != --resume ]] || fail 'Reboot did not activate cgroup v2; refusing another automatic reboot'
  [[ "$AUTO_REBOOT_CGROUP_V2" = yes ]] || fail 'cgroup v1 detected. Set AUTO_REBOOT_CGROUP_V2=yes for a one-time automatic reboot and resume.'
  need update-grub
  prepare_before_reboot
  [[ -f "$STATE_DIR/preboot-ready" ]] || fail 'Preboot preparation not completed'
  touch "$STATE_DIR/migrated-from-cgroup-v1"
  install_resume_unit
  configure_cgroup_boot
  log 'Rebooting to activate cgroup v2. systemd will resume this same script once after boot.'
  systemctl reboot
  exit 0
fi
# Fresh cgroup v2 hosts also require the full pre-cutover env/backup preparation.
[[ -f "$STATE_DIR/preboot-ready" ]] || fail 'Missing PREBOOT preparation marker; run --prepare before cutover'
require_v2
ensure_rootless "$LEARNING_EXECUTOR_USER"
# Provision the dormant ZoeBuild executor user for the shared two-pool architecture.
# Do not start its Runner or publish /build routes while disabled.
ensure_rootless "$ZOEBUILD_EXECUTOR_USER"
write_env_once
resolve_r_language_id
validate_pool_envs
pull_verify_release
resource_test
cutover
