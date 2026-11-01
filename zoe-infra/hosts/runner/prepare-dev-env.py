#!/usr/bin/env python3
"""Create dev-only two-pool env files from existing local runner/.env without printing secrets."""
from pathlib import Path
import argparse, os, pwd, re, sys

def parse_env(path: Path):
    result = {}
    for line in path.read_text().splitlines():
        if not line or line.lstrip().startswith('#') or '=' not in line: continue
        k, v = line.split('=', 1)
        k = k.strip()
        if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', k): result[k] = v
    return result

def set_env(template: Path, updates: dict):
    lines = template.read_text().splitlines()
    index = {line.split('=',1)[0]: i for i,line in enumerate(lines) if '=' in line and not line.startswith('#')}
    for k,v in updates.items():
        if v is None: continue
        if '\n' in v: raise ValueError('newline in configuration value')
        if k in index: lines[index[k]] = f'{k}={v}'
        else: lines.append(f'{k}={v}')
    return '\n'.join(lines) + '\n'

def safe_write(path, text):
    if path.exists(): raise RuntimeError(f'Refusing to replace existing {path}; edit manually instead')
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w') as f: f.write(text)

parser=argparse.ArgumentParser()
parser.add_argument('--legacy-env',default=str(Path(__file__).parent/'.env'))
parser.add_argument('--zoebuild-executor-user',default='zoebuild-exec')
args=parser.parse_args()
root=Path(__file__).resolve().parent
legacy=Path(args.legacy_env)
if not legacy.is_file(): sys.exit('Missing legacy .env; generate .env files manually from the supplied examples')
try: uid=pwd.getpwnam(args.zoebuild_executor_user).pw_uid
except KeyError: sys.exit('First create an isolated rootless executor user; see README.md')
if uid == os.getuid(): sys.exit('ERROR: ZoeBuild executor must use a different operating system user')
old=parse_env(legacy)
for key in ('GHCR_OWNER', 'RUNNER_SECRET', 'RUNNER_SHARED_SECRET', 'JUDGE0_AUTHN_TOKEN', 'JUDGE0_AUTHZ_TOKEN', 'JUDGE0_POSTGRES_PASSWORD', 'JUDGE0_REDIS_PASSWORD', 'RUNNER_DOCKER_SOCKET_HOST', 'RUNNER_CONTAINER_USER', 'RUNNER_WORKSPACE_HOST_ROOT', 'CADDY_EMAIL', 'RUNNER_DOMAIN', 'JUDGE0_DOMAIN'):
    if not old.get(key): sys.exit(f'Legacy .env missing required {key}; manually configure separate pool envs')
learning = old.copy()
learning.update(COMPOSE_PROJECT_NAME='zoeskoul-learning', RUNNER_EXECUTION_POOL='zoeskoul-learning', RUNNER_INGRESS_NETWORK='zoeskoul-runner-ingress')
# ZoeBuild gets only runner-facing auth and runner execution settings; no Judge0 DB credentials.
allowed = ('GHCR_OWNER','IMAGE_TAG','RUNNER_SECRET','RUNNER_SHARED_SECRET','RUNNER_EDGE_SECRET','PTY_ATTACH_SECRET','RUNNER_ATTACH_TOKEN_SECRET','RUNNER_ALLOWED_ORIGINS','RUNNER_CORS_ORIGIN','ALLOWED_WEB_ORIGINS','WEB_URL')
builder={k:old[k] for k in allowed if k in old}
builder.update(RUNNER_DOCKER_SOCKET_HOST=f'/run/user/{uid}/docker.sock',RUNNER_CONTAINER_USER=f'{uid}:{uid}',RUNNER_EXECUTION_POOL='zoebuild')
gateway={k:old.get(k) for k in ('CADDY_EMAIL','RUNNER_DOMAIN','JUDGE0_DOMAIN','JUDGE0_AUTHN_TOKEN')}
files={
    root/'zoeskoul-learning/.env': set_env(root/'zoeskoul-learning/.env.example',learning),
    root/'zoebuild/.env': set_env(root/'zoebuild/.env.example',builder),
    root/'gateway/.env': set_env(root/'gateway/.env.example',gateway),
}
if any(p.exists() for p in files): sys.exit('Some pool .env files already exist; refusing a partial overwrite')
for p,t in files.items(): safe_write(p,t)
print('Created three private .env files without printing secrets.')
print('Note: both pools initially use the platform runner credential; separate keys require platform client support.')
