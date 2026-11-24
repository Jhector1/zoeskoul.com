#!/usr/bin/env python3
"""PUB2A: trusted single-project development operator, not public hosting."""
import argparse
import contextlib
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from types import SimpleNamespace

# In the repo pilot.py is adjacent in publish-pilot; on the VM both files
# are installed into the same private operator tools directory.
TOOLS=Path(__file__).resolve().parent
if not (TOOLS/"pilot.py").is_file():
    sys.path.insert(0,str(TOOLS.parent/"publish-pilot"))
import pilot

CONFIG=TOOLS/"control-config.json"
MAX_RELEASES=5


def read_private(path,limit=65536):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    with os.fdopen(fd,"rb") as f:
        st=os.fstat(f.fileno())
        pilot.require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o600,"Unsafe private state")
        raw=f.read(limit+1)
    pilot.require(len(raw)<=limit,"Private state too large")
    return pilot.unique_json(raw)


def configuration():
    pilot.dev_host()
    cfg=read_private(CONFIG)
    pilot.require(isinstance(cfg,dict) and set(cfg)=={"projectId","image","revision"},"Control configuration shape")
    pilot.require(isinstance(cfg["projectId"],str) and pilot.ID.fullmatch(cfg["projectId"]) and isinstance(cfg["image"],str) and pilot.IMAGE.fullmatch(cfg["image"]) and isinstance(cfg["revision"],str) and re.fullmatch(r"[a-f0-9]{40}",cfg["revision"]),"Control configuration identity")
    return cfg


def active_path():
    return pilot.ROOT/"active-private.json"


def pointer(cfg):
    p=active_path()
    if not p.exists() and not p.is_symlink():return None
    a=read_private(p)
    pilot.require(isinstance(a,dict) and set(a)=={"projectId","sourceVersion","artifactSha256","objectSha256","activatedAt"},"Activation pointer shape")
    pilot.require(a["projectId"]==cfg["projectId"] and type(a["sourceVersion"]) is int and a["sourceVersion"]>0 and all(isinstance(a[k],str) and pilot.HEX.fullmatch(a[k]) for k in ("artifactSha256","objectSha256")) and isinstance(a["activatedAt"],str),"Activation pointer identity")
    return a


def resolve(cfg,a):
    pilot.require(a is not None,"No active private deployment")
    d,name,receipt=pilot.load_deployment(a["objectSha256"])
    pilot.require(all(receipt[k]==a[k] for k in ("projectId","sourceVersion","artifactSha256","objectSha256")),"Deployment receipt mismatch")
    # Only the exact operator-approved runtime is admissible. Runtime rotation
    # needs an explicit operator migration, never a browser-provided image.
    pilot.require(receipt["image"]==cfg["image"] and receipt["revision"]==cfg["revision"],"Deployment runtime mismatch")
    return d,name,receipt


def check_home(d,name):
    code,mime,_,body=pilot.fetch(d,name,"/",accept="text/html")
    pilot.require(code==200 and mime.lower().startswith("text/html") and bool(re.search(rb"<html(?:\s|>)",body,re.I)) and bool(re.search(rb"<body(?:\s|>)",body,re.I)),"Private website health failed")


@contextlib.contextmanager
def activation_lock():
    path=pilot.ROOT/"activation.lock"
    fd=os.open(path,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_CLOEXEC,0o600)
    try:
        st=os.fstat(fd)
        pilot.require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==0o600,"Unsafe activation lock")
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError("Private activation already running") from None
        yield
    finally:os.close(fd)


def write_pointer(value):
    # A healthy candidate is the only caller. Atomic replacement preserves
    # the previous pointer if staging or validation fails.
    fd,tmp=tempfile.mkstemp(prefix=".active-",dir=pilot.ROOT)
    try:
        with os.fdopen(fd,"w") as f:
            json.dump(value,f,separators=(",",":"));f.write("\n");f.flush();os.fsync(f.fileno())
        os.replace(tmp,active_path())
        d=os.open(pilot.ROOT,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(d)
        finally:os.close(d)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


def activate(cfg,raw):
    digest=pilot.sha(raw)
    identity,files=pilot.validate_bundle(raw,digest)
    pilot.require(identity["projectId"]==cfg["projectId"],"Bundle is not the selected project")
    with activation_lock():
        old=pointer(cfg)
        pilot.require(old is None or identity["sourceVersion"]>=old["sourceVersion"],"Older revision cannot replace the active release")
        value={k:identity[k] for k in ("projectId","sourceVersion","artifactSha256","objectSha256")}
        value["activatedAt"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
        directory=pilot.ROOT/digest
        if not directory.exists() and not directory.is_symlink():
            count=sum(1 for p in pilot.ROOT.iterdir() if pilot.HEX.fullmatch(p.name))
            pilot.require(count<MAX_RELEASES,"Private release limit reached; operator cleanup required")
            fd,tmp=tempfile.mkstemp(prefix=".incoming-",dir=pilot.ROOT)
            try:
                with os.fdopen(fd,"wb") as f:f.write(raw)
                # Reuse existing isolation, immutable materialization and SSR checks.
                # Keep the SSH machine response JSON-only.
                with contextlib.redirect_stdout(sys.stderr):
                    pilot.deploy(SimpleNamespace(bundle=tmp,sha=digest,image=cfg["image"],revision=cfg["revision"]))
            finally:
                if os.path.exists(tmp):os.unlink(tmp)
        d,name,_=resolve(cfg,value)
        # Existing deployments (including the first PUB1 release) are adopted
        # only after their exact bundle passes the full existing smoke test.
        with contextlib.redirect_stdout(sys.stderr):pilot.smoke(d,name,files)
        if old and old["objectSha256"]==digest:return old
        write_pointer(value)
        return value


def status(cfg):
    a=pointer(cfg)
    if a is None:return None
    d,name,_=resolve(cfg,a)
    check_home(d,name)
    return a


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation",choices=("activate","status","serve"))
    args=parser.parse_args();cfg=configuration()
    if args.operation=="serve":
        pilot.serve_gateway(lambda:resolve(cfg,pointer(cfg)))
    elif args.operation=="activate":
        raw=sys.stdin.buffer.read(pilot.MAX_OBJECT+1)
        print(json.dumps(activate(cfg,raw),separators=(",",":")),flush=True)
    else:print(json.dumps(status(cfg),separators=(",",":")),flush=True)

if __name__=="__main__":
    try:main()
    except (ValueError,RuntimeError,OSError,KeyError,TypeError) as e:
        # No bundle contents, registry credentials, raw logs or arbitrary exception text.
        print("PRIVATE_CONTROL_FAILED="+type(e).__name__,file=sys.stderr,flush=True)
        raise SystemExit(1)
