#!/usr/bin/env bash
# ZoeBuild project-scoped development infrastructure health. Never mutates source or Docker.
# This is the project-contained version of the verified U20G startup checker.
# Local machine contracts (SSH alias, runner UID/bridge) remain intentionally strict.
set -Eeuo pipefail
umask 077

MODE="${1:---check}"
case "$MODE" in
  --check|--prepare|--watch) ;;
  --help|-h)
    cat <<'HELP'
Usage: bash scripts/zoebuild-startup-health.sh [--check|--prepare|--watch]
  --check   One read-only infrastructure/authority health report.
  --prepare Safely restore the existing loopback-only VM 33004 SSH tunnel if absent,
            then run the same checks. Start Mac Next.js on 3004 first.
  --watch   Repeat read-only checks every 60 seconds until Ctrl+C.
Both checks save redacted timestamped output in ~/.zoeskoul/logs/zoebuild-startup/.
Authenticated project HMR requires a separate browser test. Never prints secrets.
HELP
    exit 0;;
  *) printf 'ERROR=UNKNOWN_MODE\n' >&2;exit 2;;
esac

HOME_DIR="${HOME:?HOME not set}"
# Portable project-relative source location (no user-home worktree assumption).
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
LOG_DIR="$HOME_DIR/.zoeskoul/logs/zoebuild-startup"
mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date -u +%Y-%m-%d).log"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "REDACTED_REPORT_LOG=$LOG_FILE"
SSH=(/usr/bin/ssh -q -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=7 -o ControlMaster=no)

print_actions() {
  local action seen='|'
  for action in "$@"; do
    case "$seen" in *"|$action|"*) continue;; esac
    echo "NEXT_ACTION=$action"
    seen="${seen}${action}|"
  done
}

one_check() {
  local active_mode="$1" failures=0 code mac_status mac_details mac_digest vm_identity listeners vm_output vm_digest vm_status
  local -a actions=()
  echo '============================================================'
  echo "ZOEBUILD_STARTUP_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "MODE=$active_mode"
  echo 'SCOPE=MAC_ZOEBUILD_AND_VERIFIED_UID1001_RUNNER_ONLY'
  echo 'SOURCE_DOCKER_ENV_LOCAL_SYMLINK=NEVER_MODIFIED'

  echo '=== MAC EDITOR ==='
  if [[ ! -d "$APP/src" ]];then
    echo 'MAC_APP_SOURCE=FAIL_EXPECTED_WORKTREE_NOT_FOUND';((failures+=1));actions+=(VERIFY_EXPECTED_HMR_WORKTREE)
  else
    echo 'MAC_APP_SOURCE=PASS'
    local branch
    branch="$(git -C "$APP" branch --show-current 2>/dev/null || true)"
    if [[ -n "$branch" ]];then echo 'MAC_GIT_BRANCH=DETECTED';else echo 'MAC_GIT_BRANCH=UNAVAILABLE';((failures+=1));actions+=(VERIFY_ZOEBUILD_GIT_WORKTREE);fi
  fi
  mac_status="$(curl --noproxy '*' -sS -o /dev/null --connect-timeout 2 --max-time 7 -w '%{http_code}' http://127.0.0.1:3004/ 2>/dev/null || true)"
  echo "MAC_3004_HTTP=${mac_status:-000}"
  if [[ "$mac_status" != 200 ]];then ((failures+=1));actions+=(START_EXISTING_MAC_NEXTJS_3004);fi

  mac_details="$(python3 - "$APP" <<'PY'
import sys,hashlib,re
from pathlib import Path
app=Path(sys.argv[1]); p=app/'.env.development.local'; base=app/'.env.local'
print('MAC_DEV_OVERLAY='+('PRESENT' if p.is_file() and not p.is_symlink() else 'ABSENT_OR_UNSAFE'))
print('MAC_BASE_ENV_SYMLINK='+('PRESERVED' if base.is_symlink() else 'NOT_SYMLINK'))
vals={}
if p.is_file() and not p.is_symlink():
    for line in p.read_text(errors='replace').splitlines():
        line=line.strip()
        if not line or line.startswith('#') or '=' not in line:continue
        k,v=line.split('=',1)
        k=k.strip();v=v.strip()
        if len(v)>=2 and v[0]==v[-1] and v[0] in ('"',"'"):v=v[1:-1]
        vals[k]=v
for key in ('ZOEBUILD_PREVIEW_AUTHORITY_ENABLED','ZOEBUILD_DEVELOPMENT_PREVIEW_WEB_ENABLED','ZOEBUILD_DEVELOPMENT_PREVIEW_START_ENABLED','ZOEBUILD_NATIVE_IFRAME_HMR_ENABLED'):
    print('MAC_FLAG_'+key+'='+('PASS' if vals.get(key)=='true' else 'MISSING_OR_FALSE'))
secret=vals.get('ZOEBUILD_PREVIEW_AUTHORITY_SHARED_SECRET','')
print('MAC_AUTHORITY_SECRET='+('PRESENT_NOT_PRINTED' if secret else 'MISSING'))
print('_INTERNAL_MAC_SECRET_SHA='+hashlib.sha256(secret.encode('utf8')).hexdigest() if secret else '_INTERNAL_MAC_SECRET_SHA=NONE')
print('MAC_FLAG_CHECK_SCOPE=DEV_OVERLAY_NOT_RUNNING_PROCESS')
PY
  )" || mac_details='MAC_ENV_CHECK=UNAVAILABLE'
  mac_digest="$(printf '%s\n' "$mac_details" | sed -n 's/^_INTERNAL_MAC_SECRET_SHA=//p' | tail -1)"
  printf '%s\n' "$mac_details" | grep -v '^_INTERNAL_' || true
  if [[ "$mac_details" != *'MAC_BASE_ENV_SYMLINK=PRESERVED'* || "$mac_details" != *'MAC_DEV_OVERLAY=PRESENT'* || "$mac_details" != *'MAC_AUTHORITY_SECRET=PRESENT_NOT_PRINTED'* ]];then ((failures+=1));actions+=(VERIFY_MAC_AUTHORITY_OVERLAY_AND_SYMLINK);fi
  for flag in ZOEBUILD_PREVIEW_AUTHORITY_ENABLED ZOEBUILD_DEVELOPMENT_PREVIEW_WEB_ENABLED ZOEBUILD_DEVELOPMENT_PREVIEW_START_ENABLED ZOEBUILD_NATIVE_IFRAME_HMR_ENABLED; do
    if [[ "$mac_details" != *"MAC_FLAG_${flag}=PASS"* ]];then ((failures+=1));actions+=(VERIFY_MAC_HMR_FLAGS);fi
  done

  echo '=== VERIFIED DEV VM ==='
  vm_identity="$("${SSH[@]}" zoeskoul-dev 'printf "%s|%s" "$(hostname)" "$(id -un)"' 2>/dev/null || true)"
  if [[ "$vm_identity" != 'jean-VirtualBox|jean' ]];then
    echo 'SSH_DEV_VM=FAIL_UNAVAILABLE_OR_UNEXPECTED_IDENTITY';((failures+=1));actions+=(VERIFY_KEYBASED_SSH_ALIAS_ZOESKOUL_DEV)
    echo 'RUNNER_CHECK=SKIPPED_SSH_NOT_VERIFIED'
    echo 'AUTHORITY_SECRET_COMPARE=NOT_CHECKED'
    print_actions "${actions[@]}"
    echo 'BROWSER_NATIVE_HMR=REQUIRES_AUTHENTICATED_EDITOR_PREVIEW'
    echo "STARTUP_INFRA_STATUS=FAIL FAILED_CHECKS=$failures"
    return 1
  fi
  echo 'SSH_DEV_VM=PASS'

  if [[ "$active_mode" == --prepare ]];then
    listeners="$("${SSH[@]}" zoeskoul-dev "ss -H -ltn '( sport = :33004 )' | wc -l" 2>/dev/null | tr -d '[:space:]' || true)"
    case "$listeners" in
      0)
        if [[ "$mac_status" != 200 ]];then
          echo 'TUNNEL_RECOVERY=SKIPPED_MAC_NOT_READY';((failures+=1));actions+=(START_MAC_BEFORE_TUNNEL_REPAIR)
        else
          if /usr/bin/ssh -fNT -o BatchMode=yes -o ConnectTimeout=7 -o StrictHostKeyChecking=yes \
            -o ExitOnForwardFailure=yes -o ControlMaster=no -o ServerAliveInterval=20 \
            -o ServerAliveCountMax=3 -R 127.0.0.1:33004:127.0.0.1:3004 \
            zoeskoul-dev </dev/null >/dev/null 2>&1; then
            echo 'TUNNEL_RECOVERY=RESTORED_LOOPBACK_ONLY'
          else
            echo 'TUNNEL_RECOVERY=FAIL';((failures+=1));actions+=(VERIFY_VM_SSH_REVERSE_FORWARD_POLICY)
          fi
        fi;;
      1) echo 'TUNNEL_RECOVERY=EXISTING_LISTENER_UNCHANGED';;
      *) echo 'TUNNEL_RECOVERY=SKIPPED_UNEXPECTED_LISTENER_COUNT';((failures+=1));actions+=(INSPECT_VM_PORT_33004_LISTENERS);;
    esac
  fi

  echo '=== VM TUNNEL AND VERIFIED RUNNER ==='
  vm_output="$("${SSH[@]}" zoeskoul-dev 'bash -s' 2>/dev/null <<'VM'
set -uo pipefail
printf 'VM_33004_LISTENERS='; ss -H -ltn '( sport = :33004 )' 2>/dev/null | wc -l
result="$(curl --noproxy '*' -sS -o /dev/null --connect-timeout 2 --max-time 7 -w '%{http_code}' http://127.0.0.1:33004/ 2>/dev/null || true)"
echo "VM_33004_HTTP=${result:-000}"
D=(docker --host unix:///var/run/docker.sock)
TARGET=zoebuild-runner-runner-1
meta="$(timeout 8 "${D[@]}" inspect --format '{{.State.Running}}|{{range .Mounts}}{{if eq .Destination "/docker.sock"}}{{.Source}}{{end}}{{end}}' "$TARGET" 2>/dev/null || true)"
if [[ "$meta" != 'true|/run/user/1001/docker.sock' ]];then
  echo 'RUNNER_UID1001=FAIL_UNVERIFIED_OR_NOT_RUNNING'
  exit 0
fi
echo 'RUNNER_UID1001=PASS'
timeout 12 "${D[@]}" exec -i "$TARGET" node - <<'NODE' 2>/dev/null || echo 'RUNNER_AUTHORITY_PROBE=FAILED'
const http=require('node:http'), https=require('node:https'),crypto=require('node:crypto');
const secret=process.env.ZOEBUILD_PREVIEW_AUTHORITY_SHARED_SECRET||'';
console.log('RUNNER_AUTHORITY_SECRET='+(secret?'PRESENT_NOT_PRINTED':'MISSING'));
console.log('_INTERNAL_RUNNER_SECRET_SHA='+(secret?crypto.createHash('sha256').update(secret,'utf8').digest('hex'):'NONE'));
let u;try{u=new URL(process.env.ZOEBUILD_PREVIEW_AUTHORITY_URL||'')}catch{console.log('RUNNER_AUTHORITY_ENDPOINT=FAIL_INVALID');process.exit(0)}
if(u.hostname!=='172.31.254.1'||u.port!=='3004'||!['http:','https:'].includes(u.protocol)){
  console.log('RUNNER_AUTHORITY_ENDPOINT=FAIL_UNEXPECTED');process.exit(0);
}
console.log('RUNNER_AUTHORITY_ENDPOINT=PASS_EXPECTED_BRIDGE');
const client=u.protocol==='https:'?https:http;
const req=client.get(new URL('/',u),{timeout:5000},res=>{console.log('RUNNER_AUTHORITY_HTTP='+res.statusCode);res.resume()});
req.on('timeout',()=>{console.log('RUNNER_AUTHORITY_HTTP=000_TIMEOUT');req.destroy()});
req.on('error',()=>console.log('RUNNER_AUTHORITY_HTTP=000_CONNECTION_ERROR'));
NODE
# Logs are filtered in place. Never send raw Runner logs across SSH.
timeout 10 "${D[@]}" logs --since 5m --tail 2000 "$TARGET" 2>/dev/null | python3 -c '
import sys,re
s=sys.stdin.read()
matches=list(re.finditer(r"RUNNER development preview start failed",s))
print("RUNNER_START_FAILURES_LAST_5M="+str(len(matches)))
for m in matches[-3:]:
 t=s[m.end():m.end()+350]
 stage=re.search(r"\bstage\s*[:=]\s*[\x1b\[0-9;m]*[\x27\x22]?([a-z_]+)",t)
 category=re.search(r"\bcategory\s*[:=]\s*[\x1b\[0-9;m]*[\x27\x22]?([a-z_]+)",t)
 print("RECENT_RUNNER_FAILURE_STAGE="+(stage.group(1) if stage else "unknown")+" CATEGORY="+(category.group(1) if category else "unknown"))
' 2>/dev/null || echo 'RUNNER_FAILURE_SUMMARY=UNAVAILABLE'
VM
  )" || vm_output='VM_INSPECTION=FAILED'
  vm_digest="$(printf '%s\n' "$vm_output" | sed -n 's/^_INTERNAL_RUNNER_SECRET_SHA=//p' | tail -1)"
  printf '%s\n' "$vm_output" | grep -v '^_INTERNAL_' || true
  if [[ "$vm_output" != *'VM_33004_HTTP=200'* ]];then ((failures+=1));actions+=(RUN_PREPARE_TO_RECOVER_OR_DIAGNOSE_33004);fi
  if [[ "$vm_output" != *'RUNNER_UID1001=PASS'* ]];then ((failures+=1));actions+=(INSPECT_EXACT_UID1001_RUNNER);fi
  if [[ "$vm_output" != *'RUNNER_AUTHORITY_HTTP=200'* ]];then ((failures+=1));actions+=(INSPECT_RUNNER_AUTHORITY_BRIDGE);fi
  if [[ "$vm_output" != *'RUNNER_AUTHORITY_ENDPOINT=PASS_EXPECTED_BRIDGE'* ]];then ((failures+=1));actions+=(VERIFY_RUNNER_AUTHORITY_URL_CONFIGURATION);fi
  if [[ -n "$mac_digest" && "$mac_digest" != NONE && -n "$vm_digest" && "$vm_digest" != NONE ]]; then
    if [[ "$mac_digest" == "$vm_digest" ]];then
      echo 'AUTHORITY_SECRET_COMPARE=PASS_MATCHES_NO_SECRET_PRINTED'
    else
      echo 'AUTHORITY_SECRET_COMPARE=FAIL_MISMATCH';((failures+=1));actions+=(REVIEW_AUTHORITY_SECRET_SYNC_WITHOUT_PRINTING_SECRET)
    fi
  else
    echo 'AUTHORITY_SECRET_COMPARE=FAIL_UNAVAILABLE';((failures+=1));actions+=(REVIEW_AUTHORITY_SECRET_PRESENCE)
  fi
  echo 'BROWSER_NATIVE_HMR=REQUIRES_AUTHENTICATED_EDITOR_PREVIEW'
  if (( ${#actions[@]} > 0 ));then print_actions "${actions[@]}";fi
  echo 'BROWSER_SUCCESS_MARKERS=start:200,read-access:200,vite_signal_connected,bridge_bound,iframe_vite_client_ready'
  if (( failures > 0 ));then
    echo "STARTUP_INFRA_STATUS=FAIL FAILED_CHECKS=$failures"
    return 1
  else
    echo 'STARTUP_INFRA_STATUS=PASS BROWSER_HMR_NOT_ASSERTED'
    return 0
  fi
}

if [[ "$MODE" == --watch ]];then
  echo 'WATCH_INTERVAL=60s STOP=CTRL_C'
  trap 'echo "ZOEBUILD_WATCH_STOPPED_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)";exit 0' INT TERM
  while :;do
    one_check --check || true
    sleep 60
  done
else
  one_check "$MODE"
fi
