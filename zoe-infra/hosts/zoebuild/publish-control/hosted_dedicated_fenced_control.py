#!/usr/bin/env python3
"""Single dedicated development project; no legacy mutation or public admission."""
import argparse, json, os, pathlib, stat, sys
import control, hosted_control, pilot
PROJECT='cmwvhcusk0002u0dlwhxh9uh2'
LEGACY='cmwq2ynpn0002f3dl4kkz7uhi'
HOSTED={'cmw4n3kv70006u8dl1xji1rvr','cmwpd1v3z00026pdl6vkaj6zk'}
def need(v,msg):
    if not v: raise RuntimeError(msg)
def private(p,create=False):
    if create:p.mkdir(mode=0o700,exist_ok=True)
    s=p.lstat();need(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and stat.S_IMODE(s.st_mode)==0o700,'UNSAFE_DEDICATED_DIRECTORY');return p
def bind(create=False):
    cfg=control.configuration()
    need(cfg['projectId']==LEGACY and set(control.read_private(hosted_control.ALLOWLIST)['projectIds'])==HOSTED,'LEGACY_SCOPE_CHANGED')
    box=private(pathlib.Path.home()/'.zoeskoul'/'fenced-publish-dev-v1',create)
    private(box/'legacy',create)
    root=private(private(box/'hosted-publish-dev',create)/PROJECT,create)
    need(root!=pilot.ROOT and root.parent!=pilot.ROOT.parent/'hosted-publish-dev','LIVE_ROOT_DENIED')
    pilot.ROOT=root
    return {**cfg,'projectId':PROJECT},root
def main():
    parser=argparse.ArgumentParser();parser.add_argument('project');parser.add_argument('operation',choices=('fenced-init','fenced-ack','fenced-apply'));args=parser.parse_args()
    need(args.project==PROJECT,'DEDICATED_PROJECT_DENIED')
    cfg,root=bind(args.operation=='fenced-init')
    if args.operation=='fenced-init':
        if control.fenced_mode():
            result=hosted_control.dispatch(cfg,'fenced-ack')
            need(result=={'fence':'0','acknowledgement':None},'DEDICATED_RUNTIME_ALREADY_USED')
        else:
            need(not any(root.iterdir()),'NONEMPTY_DEDICATED_ROOT')
            result=hosted_control.dispatch(cfg,'fenced-init')
    else:
        raw=sys.stdin.buffer.read(pilot.MAX_OBJECT+16386) if args.operation=='fenced-apply' else b''
        result=hosted_control.dispatch(cfg,args.operation,raw)
    print(json.dumps(result,separators=(',',':')),flush=True)
if __name__=='__main__':main()
