#!/usr/bin/env python3
"""Root-owned production adapter. Only hosting UID, one operator-provisioned project.
No SSH login or public listener is configured by this source. Production grant transport
must be provisioned separately from the mutation identity. Never initialize on a request.
"""
import argparse, contextlib, json, os, pathlib, re, stat, sys
# Installed with the existing root-owned production_runtime.py and exact dependencies.
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
import pilot, production_runtime as runtime, control, hosted_control, hosted_gateway as gateway
import hosted_committed_authority as authority, hosted_fast_gateway as fast, hosted_fenced_provider as fenced
CONFIG=pathlib.Path('/etc/zoebuild-hosting/pilot.json')
LEGACY='production-legacy-disabled'

def need(value,code):
    if not value: raise RuntimeError(code)

def private_dir(path,create=False):
    if create: path.mkdir(mode=0o700,exist_ok=True)
    s=path.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o700,'UNSAFE_RUNTIME_DIR')
    return path

def config():
    runtime.guard()
    for p in (CONFIG.parent,CONFIG):
        s=p.lstat();need(s.st_uid==0 and not (s.st_mode&0o022) and (stat.S_ISDIR(s.st_mode) if p==CONFIG.parent else stat.S_ISREG(s.st_mode)),'UNSAFE_OPERATOR_CONFIG')
    v=pilot.unique_json(CONFIG.read_bytes())
    need(isinstance(v,dict) and set(v)=={'projectId'} and isinstance(v['projectId'],str) and pilot.ID.fullmatch(v['projectId']) and v['projectId']!=LEGACY,'PROJECT_CONFIG_INVALID')
    return v['projectId']

def setup():
    p=runtime.guard();project=config();os.umask(0o077)
    base=private_dir(private_dir(pathlib.Path(p.pw_dir)/'.zoeskoul',True)/'production-publish-v1',True)
    legacy=private_dir(base/'legacy',True);parent=private_dir(base/'hosted-publish-dev',True)
    cfg={'projectId':LEGACY,'image':runtime.IMAGE,'revision':runtime.REVISION}
    allow={'projectIds':[project]}
    pilot.ROOT=legacy
    # Three retained running containers at most (3 x 512 MiB) inside the 2 GiB hosting slice.
    control.MAX_RELEASES=3
    def checked_root():
        runtime.guard();private_dir(base);private_dir(parent)
        need(pilot.ROOT in (legacy,parent/project),'PROJECT_ROOT_DENIED');private_dir(pilot.ROOT)
    pilot.dev_host=checked_root;pilot.docker=runtime.docker
    def verify(*args,**kwargs):
        with contextlib.redirect_stdout(sys.stderr):return runtime.verify(*args,**kwargs)
    pilot.verify_container=verify
    def checked_configuration():
        runtime.guard();need(config()==project,'CONFIG_CHANGED');return cfg
    control.configuration=checked_configuration
    old_read=control.read_private
    # Existing validators consume one immutable operator-selected allowlist, never request data.
    hosted_control.ALLOWLIST=base/'operator-allowlist'
    def read(path,limit=65536):
        if path==hosted_control.ALLOWLIST:
            need(config()==project,'CONFIG_CHANGED');return allow
        return old_read(path,limit)
    control.read_private=read
    gateway.DB_ROUTES=base/'routes.json';authority.GRANTS=base/'grants.json'
    return project,parent,legacy,cfg

def main():
    a=argparse.ArgumentParser();a.add_argument('operation',choices=('fenced-init','fenced-ack','fenced-apply','install-grants','serve','worker'));a.add_argument('project');args=a.parse_args()
    project,parent,legacy,cfg=setup();need(args.project==project,'PROJECT_DENIED')
    root=parent/project
    if args.operation=='fenced-init':
        # Operator only. No reinitialization of an existing directory or state.
        need(not os.path.lexists(root),'PROJECT_ALREADY_EXISTS');root=private_dir(root,True);pilot.ROOT=root
        result=fenced.initialize({**cfg,'projectId':project});print(json.dumps(result,separators=(',',':')),flush=True);return
    private_dir(root)
    if args.operation in ('fenced-ack','fenced-apply'):
        pilot.ROOT=root;pcfg={**cfg,'projectId':project}
        if args.operation=='fenced-ack':result=fenced.status(pcfg)
        else:
            raw=sys.stdin.buffer.read(pilot.MAX_OBJECT+16386);result=fenced.apply(pcfg,raw)
        print(json.dumps(result,separators=(',',':')),flush=True);return
    # Serving and authority paths never bind process-global ROOT to a request's arbitrary value.
    pilot.ROOT=legacy
    if args.operation=='install-grants':
        raw=sys.stdin.buffer.read(65537);need(0<len(raw)<=65536,'GRANT_FRAME_LIMIT');grants=pilot.unique_json(raw)
        # Existing exact grant/runtime agreement remains mandatory before serving.
        now=gateway.now_ms();allow={'projectIds':[project]};verified=authority.validate(grants,allow,LEGACY,now)
        need(grants['expiresAtMs']-now>=2000,'GRANT_BUDGET_TOO_SMALL')
        routes={'issuedAtMs':grants['issuedAtMs'],'expiresAtMs':grants['issuedAtMs']+30000,'routes':{host:g['projectId'] for host,g in verified.items()}}
        gateway.lease_routes(routes,allow,LEGACY,now)
        authority.install(grants);gateway.install_snapshot(routes);print('COMMITTED_GRANTS_INSTALLED=YES',flush=True);return
    if args.operation=='worker':fast.worker_loop(project,pilot,gateway);return
    path=str(pathlib.Path(__file__).resolve())
    pool=fast.WorkerPool(lambda p:fast.LineProcess([sys.executable,'-B',path,'worker',p],pilot.MAX_FILE*4//3+4096,60),gateway.decode)
    try:
        with gateway.Gateway(('127.0.0.1',33109),{},fetch=pool.fetch,lookup=lambda host:gateway.configured(True)[1].get(host),guard=lambda h,p:fast.committed_guard(gateway,h,p)) as server:server.serve_forever()
    finally:pool.close()

if __name__=='__main__':
    try:main()
    except Exception as e:print('PRODUCTION_CONTROL_FAILED='+type(e).__name__,file=sys.stderr);raise SystemExit(1)
