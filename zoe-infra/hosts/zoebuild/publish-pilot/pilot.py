#!/usr/bin/env python3
"""Operator-only private publication pilot. No public HTTP listener or editor lease."""
import argparse
import base64
import hashlib
import http.server
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
import uuid

HEX = re.compile(r"[a-f0-9]{64}\Z")
ID = re.compile(r"[A-Za-z0-9_-]{4,128}\Z")
PART = re.compile(r"[A-Za-z0-9_.@+()\[\] -]{1,255}\Z")
IMAGE = re.compile(r"ghcr\.io/jhector1/zoeskoul-publish-pilot@sha256:[a-f0-9]{64}\Z")
MAX_OBJECT = 56 * 1024 * 1024
MAX_FILE = 12 * 1024 * 1024
MAX_TOTAL = 32 * 1024 * 1024
LABEL = "com.zoeskoul.publish-pilot"
PORT = 33105
ROOT = Path.home() / ".zoeskoul" / "publish-pilot"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unique_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "Duplicate JSON field")
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs)


def validate_bundle(raw, object_sha):
    require(isinstance(raw, bytes) and 0 < len(raw) <= MAX_OBJECT, "Bundle byte limit")
    require(HEX.fullmatch(object_sha) and sha(raw) == object_sha, "Object SHA256 mismatch")
    b = unique_json(raw)
    require(isinstance(b, dict) and set(b) == {"kind","buildProjectId","sourceVersion","snapshotSha256","artifact"}, "Bundle shape")
    require(b["kind"] == "worker-bundle-v1" and isinstance(b["buildProjectId"], str) and ID.fullmatch(b["buildProjectId"]), "Bundle identity")
    require(type(b["sourceVersion"]) is int and 0 < b["sourceVersion"] <= 2**53-1, "Source revision")
    require(isinstance(b["snapshotSha256"], str) and HEX.fullmatch(b["snapshotSha256"]), "Source fingerprint")
    a = b["artifact"]
    require(isinstance(a, dict) and set(a) == {"type","serverOutputPath","assetsOutputPath","entrypoint","sha256","totalBytes","files"}, "Artifact shape")
    require((a["type"],a["serverOutputPath"],a["assetsOutputPath"],a["entrypoint"]) == ("worker-bundle","dist/server","dist/client","index.js"), "Artifact kind")
    require(isinstance(a["sha256"],str) and HEX.fullmatch(a["sha256"]), "Artifact digest shape")
    require(type(a["totalBytes"]) is int and 0 < a["totalBytes"] <= MAX_TOTAL, "Artifact byte limit")
    require(isinstance(a["files"],list) and 0 < len(a["files"]) <= 1000, "Artifact file limit")
    files, seen, total, digest = {}, set(), 0, hashlib.sha256()
    for f in a["files"]:
        require(isinstance(f,dict) and set(f)=={"path","encoding","data"}, "File shape")
        p = f["path"]
        require(isinstance(p,str) and len(p)<=1024, "Path length")
        parts=p.split("/")
        require(len(parts)>=2 and parts[0] in ("server","client") and all(PART.fullmatch(x) and x not in (".","..") and not re.match(r"^\.(env|dev\.vars)(\.|$)",x,re.I) for x in parts), "Unsafe artifact path")
        require(p.casefold() not in seen, "Duplicate artifact path")
        seen.add(p.casefold())
        data=f["data"]
        require(f["encoding"]=="base64" and isinstance(data,str) and len(data)<=4*((MAX_FILE+2)//3), "File encoding limit")
        value=base64.b64decode(data,validate=True)
        require(base64.b64encode(value).decode()==data and len(value)<=MAX_FILE, "Noncanonical file bytes")
        total+=len(value)
        require(total<=MAX_TOTAL, "Artifact total limit")
        digest.update(p.encode()); digest.update(b"\0"); digest.update(value); digest.update(b"\0")
        files[p]=value
    # Detect path/file prefix conflicts case-insensitively before materializing anything.
    for p in seen:
        parts=p.split("/")
        require(not any("/".join(parts[:i]) in seen for i in range(1,len(parts))), "Artifact file/directory collision")
    require(total==a["totalBytes"] and digest.hexdigest()==a["sha256"], "Artifact integrity mismatch")
    require(files.get("server/index.js") and 0<len(files.get("server/wrangler.json",b""))<=65536 and any(p.startswith("client/") and v for p,v in files.items()), "Missing server or client artifact")
    require(isinstance(unique_json(files["server/wrangler.json"]),dict), "Worker metadata shape")
    return {"projectId":b["buildProjectId"],"sourceVersion":b["sourceVersion"],"snapshotSha256":b["snapshotSha256"],"artifactSha256":a["sha256"],"objectSha256":object_sha}, files


def fixture():
    png=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP8sAAAAASUVORK5CYII=")
    files={"client/assets/app.css":b"body{color:green}","client/assets/app.js":b"console.log('pilot')", "client/images/pilot.png":png,
           "server/index.js":b'''export default {fetch(request){if(new URL(request.url).pathname==='/api/health')return Response.json({ok:true});return new Response('<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css"></head><body><img src="/images/pilot.png"><script src="/assets/app.js"></script>pilot SSR</body></html>',{headers:{'content-type':'text/html; charset=utf-8'}})}}''',
           "server/wrangler.json":json.dumps({"main":"index.js","compatibility_date":"2026-10-01","compatibility_flags":["nodejs_compat"],"assets":{"directory":"../client"},"no_bundle":True}).encode()}
    return encode_fixture(files), files


def encode_fixture(files):
    digest=hashlib.sha256()
    items=[]
    for p,data in sorted(files.items()):
        digest.update(p.encode());digest.update(b"\0");digest.update(data);digest.update(b"\0")
        items.append({"path":p,"encoding":"base64","data":base64.b64encode(data).decode()})
    return json.dumps({"kind":"worker-bundle-v1","buildProjectId":"pilot-fixture","sourceVersion":1,"snapshotSha256":"a"*64,"artifact":{"type":"worker-bundle","serverOutputPath":"dist/server","assetsOutputPath":"dist/client","entrypoint":"index.js","sha256":digest.hexdigest(),"totalBytes":sum(map(len,files.values())),"files":items}},separators=(",",":")).encode()


def command(args, timeout=30, check=True):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if check and p.returncode:
        # Do not expose generated code, environment values or registry credentials.
        raise RuntimeError(f"Docker operation failed (exit {p.returncode})")
    return p


def docker():
    d=["docker","--host","unix:///var/run/docker.sock"]
    if command(d+["info"],check=False).returncode:
        d=["sudo","-n",*d]
    command(d+["info"])
    return d


def inspect(d,name):
    p=command(d+["container","inspect",name],check=False)
    if p.returncode: return None
    return json.loads(p.stdout)[0]


def verify_image(d,image,revision):
    info=json.loads(command(d+["image","inspect",image]).stdout)[0]
    require(info["Os"]=="linux" and info["Architecture"]=="amd64", "Image platform mismatch")
    require(info["Config"].get("Labels",{}).get("org.opencontainers.image.revision")==revision, "Image source revision mismatch")
    return info["Id"]


def container_options(name, image, dist, digest, restart=False):
    require(dist.is_absolute() and not re.search(r"[,\r\n]",str(dist)),"Unsafe bind path")
    args=["run","-d","--name",name,"--label",f"{LABEL}=true","--label",f"{LABEL}.object={digest}",
          "--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges=true",
          "--user","1000:1000","--memory","512m","--memory-swap","512m","--cpus","0.75","--pids-limit","96","--init",
          "--tmpfs","/tmp:rw,noexec,nosuid,nodev,size=128m,mode=1777","--log-driver","local","--log-opt","max-size=1m","--log-opt","max-file=2",
          "--mount",f"type=bind,source={dist},target=/workspace/dist,readonly"]
    if restart: args.extend(["--restart","unless-stopped"])
    return args+[image]


def verify_container(info, dist, digest, image_id, restart):
    require(info is not None and info["State"]["Running"], "Pilot container is not running")
    c,h=info["Config"],info["HostConfig"]
    require(c.get("Labels",{}).get(LABEL)=="true" and c["Labels"].get(LABEL+".object")==digest and info["Image"]==image_id, "Container identity mismatch")
    require(c["User"]=="1000:1000" and h["NetworkMode"]=="none" and h["ReadonlyRootfs"] and not h["Privileged"] and "ALL" in h["CapDrop"] and any(v in ("no-new-privileges:true","no-new-privileges=true","no-new-privileges") for v in h["SecurityOpt"]), "Container isolation mismatch")
    require(h["Memory"]==512*1024**2 and h["MemorySwap"]==h["Memory"] and h["NanoCpus"]==750000000 and h["PidsLimit"]==96 and h["Init"], "Container limits mismatch")
    require(not h.get("PortBindings") and not h.get("Devices") and not h.get("PublishAllPorts"), "Unexpected ports or devices")
    require(h["RestartPolicy"]["Name"]==("unless-stopped" if restart else "no"), "Restart policy mismatch")
    require(h.get("Tmpfs")=={"/tmp":"rw,noexec,nosuid,nodev,size=128m,mode=1777"},"Unexpected tmpfs configuration")
    mounts=[m for m in info["Mounts"] if not (m["Type"]=="tmpfs" and m["Destination"]=="/tmp")]
    require(len(mounts)==1 and mounts[0]["Type"]=="bind" and Path(mounts[0]["Source"]).resolve()==dist.resolve() and mounts[0]["Destination"]=="/workspace/dist" and not mounts[0]["RW"], "Unexpected container mounts")
    return info


# This trusted program executes inside the sandbox. User code never receives a Docker socket,
# host credentials, cookies or raw request headers. It cannot make host network requests.
HTTP_PROGRAM=r'''const http=require('node:http');const [method,path,accept]=process.argv.slice(1);const max=12*1024*1024;const req=http.request({hostname:'127.0.0.1',port:5173,method,path,headers:{accept,'accept-encoding':'identity'}},res=>{let size=0;const chunks=[];res.on('data',c=>{size+=c.length;if(size>max){res.destroy();process.exit(2)}chunks.push(c)});res.on('end',()=>process.stdout.write(JSON.stringify({status:res.statusCode,contentType:res.headers['content-type']||'application/octet-stream',location:res.headers.location||'',body:Buffer.concat(chunks).toString('base64')})));res.on('error',()=>process.exit(2));});req.setTimeout(10000,()=>req.destroy());req.on('error',()=>process.exit(2));req.end();'''


def safe_path(p):
    return isinstance(p,str) and 0<len(p)<=2048 and p.startswith("/") and not p.startswith("//") and not re.search(r"[\\#\x00-\x20\x7f-\uffff]",p)


def fetch(d,name,path,method="GET",accept="*/*"):
    require(method in ("GET","HEAD") and safe_path(path), "Invalid request")
    r=unique_json(command(d+["exec",name,"node","-e",HTTP_PROGRAM,method,path,accept],timeout=15).stdout)
    require(type(r["status"]) is int and 200<=r["status"]<=599, "Response status invalid")
    require(isinstance(r["contentType"],str) and len(r["contentType"])<=200 and not re.search(r"[^\x20-\x7e]",r["contentType"]), "Response content type invalid")
    require(isinstance(r["location"],str) and (not r["location"] or safe_path(r["location"])), "External redirect unsupported in private pilot")
    data=base64.b64decode(r["body"],validate=True)
    require(len(data)<=MAX_FILE, "Response limit")
    return r["status"],r["contentType"],r["location"],data


def smoke(d,name,files):
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        try:
            status,mime,_,home=fetch(d,name,"/",accept="text/html")
            if status==200 and mime.lower().startswith("text/html") and re.search(rb"<html(?:\s|>)",home,re.I) and re.search(rb"<body(?:\s|>)",home,re.I): break
        except Exception: pass
        time.sleep(1)
    else: raise RuntimeError("SSR readiness failed")
    checked=[]
    for suffix in (".js",".css"):
        candidates=[p for p in files if p.startswith("client/") and p.endswith(suffix) and (b'"/'+p[7:].encode()+b'"' in home or b"'/"+p[7:].encode()+b"'" in home)]
        require(candidates,"Missing referenced client asset: "+suffix)
        p=candidates[0]
        status,mime,_,data=fetch(d,name,"/"+p[7:])
        require(status==200 and data==files[p],"Client asset integrity mismatch")
        require((suffix==".css" and mime.lower().startswith("text/css")) or (suffix==".js" and re.match(r"^(text|application)/(javascript|ecmascript)(;|$)",mime,re.I)),"Client asset MIME mismatch")
        checked.append(p)
    # Validate a directly referenced image if the site has one. No requirement that
    # unused source assets survive tree shaking.
    images=[p for p in files if p.startswith("client/") and re.search(r"\.(png|jpe?g|webp|gif|svg|avif)$",p,re.I) and (b'"/'+p[7:].encode()+b'"' in home or b"'/"+p[7:].encode()+b"'" in home)]
    if images:
        p=images[0];status,mime,_,data=fetch(d,name,"/"+p[7:])
        require(status==200 and mime.startswith("image/") and data==files[p],"Published image integrity mismatch")
    print("SSR_HTTP=200; CLIENT_JS_CSS=VERIFIED; REFERENCED_IMAGE="+("VERIFIED" if images else "NOT_PRESENT"),flush=True)


def materialize(dist, files):
    dist.mkdir(mode=0o755)
    for p,value in files.items():
        target=dist/p
        target.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
        with target.open("xb") as out:out.write(value)
        target.chmod(0o444)
    # The host parent is private; rootful Docker mounts only the compiled dist.
    for directory in [dist,*[p for p in dist.rglob("*") if p.is_dir()]]:directory.chmod(0o555)


def dev_host():
    require(os.uname().nodename=="jean-VirtualBox" and os.environ.get("USER")=="jean", "Private pilot is restricted to the verified development VM")
    os.umask(0o077)
    require(not ROOT.is_symlink() and not ROOT.parent.is_symlink(), "Unsafe pilot root")
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    require(ROOT.stat().st_uid==os.getuid() and ROOT.stat().st_mode&0o077==0,"Pilot root permissions")


def deployment_name(digest):
    require(HEX.fullmatch(digest),"Invalid object digest")
    return "zoebuild-publish-pilot-"+digest[:24]


def cleanup_dist(path):
    if path.exists():
        for p in [path,*[p for p in path.rglob("*") if p.is_dir()]]:p.chmod(0o700)
        shutil.rmtree(path)


def deploy(args):
    dev_host()
    require(IMAGE.fullmatch(args.image) and re.fullmatch(r"[a-f0-9]{40}",args.revision), "Immutable GHCR image and source revision required")
    bundle=Path(args.bundle)
    require(bundle.is_file() and not bundle.is_symlink() and bundle.stat().st_size<=MAX_OBJECT,"Bundle file invalid")
    identity,files=validate_bundle(bundle.read_bytes(),args.sha)
    d=docker(); command(d+["pull",args.image],timeout=300)
    image_id=verify_image(d,args.image,args.revision)
    directory=ROOT/args.sha; dist=directory/"dist"; name=deployment_name(args.sha)
    require(not directory.exists() and inspect(d,name) is None,"Candidate already exists; use status/serve or explicitly remove the exact pilot")
    directory.mkdir(mode=0o700)
    created=False
    try:
        materialize(dist,files)
        receipt={**identity,"image":args.image,"imageId":image_id,"revision":args.revision,"container":name}
        (directory/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
        command(d+container_options(name,args.image,dist,args.sha,True),timeout=60);created=True
        verify_container(inspect(d,name),dist,args.sha,image_id,True)
        smoke(d,name,files)
        print("PRIVATE_DEPLOYMENT=PASS; PUBLIC_ROUTING=NONE; PRODUCTION_MODIFIED=NO",flush=True)
        print("OBJECT_SHA256="+args.sha+"\nARTIFACT_SHA256="+identity["artifactSha256"]+"\nCONTAINER="+name)
    except BaseException:
        # Never remove a pre-existing container. Docker may have created the
        # candidate even when run returned failure; inspect exact identity first.
        info=inspect(d,name)
        if info and info.get("Config",{}).get("Labels",{}).get(LABEL+".object")==args.sha and info.get("Image")==image_id:
            command(d+["rm","-f",name]);created=False
        elif created or info:
            raise RuntimeError("Candidate cleanup identity mismatch; retained for operator review")
        cleanup_dist(directory)
        raise


def load_deployment(digest):
    dev_host();name=deployment_name(digest);directory=ROOT/digest
    require(directory.is_dir() and not directory.is_symlink(),"Deployment missing")
    receipt=unique_json((directory/"receipt.json").read_bytes())
    require(receipt["objectSha256"]==digest and receipt["container"]==name and IMAGE.fullmatch(receipt["image"]),"Deployment receipt mismatch")
    d=docker();image_id=verify_image(d,receipt["image"],receipt["revision"])
    require(image_id==receipt["imageId"],"Runtime image mismatch")
    verify_container(inspect(d,name),directory/"dist",digest,image_id,True)
    return d,name,receipt


def remove(args):
    dev_host()
    require(HEX.fullmatch(args.sha) and args.confirm == args.sha,"Exact object SHA confirmation required")
    name=deployment_name(args.sha);directory=ROOT/args.sha
    require(directory.is_dir() and not directory.is_symlink(),"Deployment missing")
    receipt=unique_json((directory/"receipt.json").read_bytes())
    require(receipt["objectSha256"]==args.sha and receipt["container"]==name and IMAGE.fullmatch(receipt["image"]),"Deployment receipt mismatch")
    d=docker();info=inspect(d,name)
    if info:
        require(info["Config"].get("Labels",{}).get(LABEL)=="true" and info["Config"]["Labels"].get(LABEL+".object")==args.sha and info["Image"]==receipt["imageId"],"Refusing unrelated container removal")
        command(d+["rm","-f",name])
    cleanup_dist(directory)
    print("PRIVATE_PILOT_REMOVED=PASS; R2_UNCHANGED=YES")


def serve(args):
    d,name,receipt=load_deployment(args.sha)
    slots=threading.BoundedSemaphore(4)
    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version="HTTP/1.0"
        def setup(self):
            super().setup();self.connection.settimeout(15)
        def log_message(self,*_):pass
        def do_GET(self):self.forward("GET")
        def do_HEAD(self):self.forward("HEAD")
        def forward(self,method):
            if self.headers.get("Host")!=f"127.0.0.1:{PORT}" or not safe_path(self.path):
                self.send_error(400);return
            if not slots.acquire(blocking=False):self.send_error(503);return
            try:
                status,mime,location,data=fetch(d,name,self.path,method)
            except Exception:
                self.send_error(502);return
            finally:slots.release()
            self.send_response(status);self.send_header("Content-Type",mime)
            self.send_header("Cache-Control","no-store");self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("Referrer-Policy","no-referrer")
            if location:self.send_header("Location",location)
            self.send_header("Content-Length",str(len(data)));self.end_headers()
            if method=="GET":self.wfile.write(data)
    with http.server.ThreadingHTTPServer(("127.0.0.1",PORT),Handler) as server:
        print(f"PRIVATE_GATEWAY_READY=http://127.0.0.1:{PORT}/; OBJECT_SHA256={receipt['objectSha256']}",flush=True)
        server.serve_forever()


def image_smoke(image):
    d=docker();raw,files=fixture();digest=sha(raw);validate_bundle(raw,digest)
    name="zoebuild-publish-smoke-"+uuid.uuid4().hex[:20]
    directory=Path(tempfile.mkdtemp(prefix="zoebuild-pilot-smoke-"));dist=directory/"dist"
    try:
        materialize(dist,files)
        image_id=json.loads(command(d+["image","inspect",image]).stdout)[0]["Id"]
        command(d+container_options(name,image,dist,digest),timeout=60)
        verify_container(inspect(d,name),dist,digest,image_id,False)
        smoke(d,name,files)
        status,mime,_,body=fetch(d,name,"/api/health")
        require(status==200 and mime.startswith("application/json") and json.loads(body)=={"ok":True},"Dynamic Worker health failed")
        print("REAL_WORKER_IMAGE_SMOKE=PASS")
    finally:
        info=inspect(d,name)
        if info and info.get("Config",{}).get("Labels",{}).get(LABEL+".object")==digest:command(d+["rm","-f",name])
        cleanup_dist(directory)


class Tests(unittest.TestCase):
    def test_bundle(self):
        raw,files=fixture();ref,out=validate_bundle(raw,sha(raw));self.assertEqual(files,out);self.assertEqual(ref["sourceVersion"],1)
    def test_wrong_digest(self):
        raw,_=fixture()
        with self.assertRaises(ValueError):validate_bundle(raw,"f"*64)
    def test_paths(self):
        _,files=fixture()
        for path in ["client/../escape","server/.env","server/.dev.vars.local","client\\x","client/assets/app.css/x","client/ASSETS/APP.CSS","/client/a"]:
            raw=encode_fixture({**files,path:b"x"})
            with self.subTest(path=path),self.assertRaises(ValueError):validate_bundle(raw,sha(raw))
    def test_tampered_artifact(self):
        raw,_=fixture();value=json.loads(raw);value["artifact"]["files"][0]["data"]="YQ==";raw=json.dumps(value).encode()
        with self.assertRaises(ValueError):validate_bundle(raw,sha(raw))
    def test_duplicate_json(self):
        raw=b'{"kind":"x","kind":"y"}'
        with self.assertRaises(ValueError):validate_bundle(raw,sha(raw))
    def test_materialization(self):
        _,files=fixture();root=Path(tempfile.mkdtemp())
        try:
            materialize(root/"dist",files)
            for p,value in files.items():self.assertEqual((root/"dist"/p).read_bytes(),value)
        finally:cleanup_dist(root)
    def test_paths_transport(self):
        self.assertTrue(safe_path("/assets/app.js?v=1"))
        for p in ["//other/","https://other/","/x\r\nX:1","/x\\y","/x#frag"]:self.assertFalse(safe_path(p))
    def test_isolation_args(self):
        args=container_options("test","image",Path("/private/dist"),"a"*64,True)
        for flag in ["--network","none","--read-only","--cap-drop","ALL","--memory-swap","512m","--restart","unless-stopped"]:self.assertIn(flag,args)
        for flag in ["--privileged","-p","--publish","--env-file","--env"]:self.assertNotIn(flag,args)


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest="operation",required=True)
    sub.add_parser("self-test")
    s=sub.add_parser("image-smoke");s.add_argument("--image",required=True)
    s=sub.add_parser("deploy");s.add_argument("--bundle",required=True);s.add_argument("--sha",required=True);s.add_argument("--image",required=True);s.add_argument("--revision",required=True)
    for name in ("status","serve"):
        s=sub.add_parser(name);s.add_argument("--sha",required=True)
    s=sub.add_parser("remove");s.add_argument("--sha",required=True);s.add_argument("--confirm",required=True)
    args=p.parse_args()
    if args.operation=="self-test":
        result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests))
        raise SystemExit(0 if result.wasSuccessful() else 1)
    if args.operation=="image-smoke":image_smoke(args.image)
    elif args.operation=="deploy":deploy(args)
    elif args.operation=="serve":serve(args)
    elif args.operation=="remove":remove(args)
    else:
        d,name,receipt=load_deployment(args.sha);status,mime,_,_=fetch(d,name,"/",accept="text/html")
        require(status==200 and mime.startswith("text/html"),"Private deployment health failed")
        print("PRIVATE_DEPLOYMENT=HEALTHY; PUBLIC_ROUTING=NONE\n"+json.dumps(receipt,indent=2))

if __name__=="__main__":
    try:main()
    except (ValueError,RuntimeError,subprocess.TimeoutExpired,OSError) as e:
        raise SystemExit("PILOT_FAILED: "+(str(e) if isinstance(e,(ValueError,RuntimeError)) else type(e).__name__))
