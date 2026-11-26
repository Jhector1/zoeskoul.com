"""Candidate committed-only gateway. Never start alongside a publisher cutover implicitly."""
import argparse, base64, contextlib, json, os, pathlib, re, selectors, subprocess, sys, threading, time

MAX_REQUEST = 8192
MAX_SESSIONS = 4
PER_PROJECT = 2
IDLE_SECONDS = 30
RELAY_PROGRAM = "\nconst { Worker } = require('node:worker_threads');\nconst program = Buffer.from(process.argv[1], 'base64').toString('utf8');\nconst limit = Number(process.argv[2]);\nif (!Number.isSafeInteger(limit) || limit < 1024 || limit > 128*1024*1024) process.exit(2);\nlet pending = Buffer.alloc(0), busy = false;\nlet idle = setTimeout(() => process.exit(0), 45000);\nfunction fail() { process.exit(2); }\nprocess.stdin.on('data', chunk => {\n  clearTimeout(idle);\n  if (busy || pending.length + chunk.length > 8192) return fail();\n  pending = Buffer.concat([pending, chunk]);\n  const end = pending.indexOf(10);\n  if (end < 0) return;\n  if (end !== pending.length-1) return fail();\n  let req; try { req=JSON.parse(pending.toString('utf8')); } catch { return fail(); }\n  pending=Buffer.alloc(0);\n  if (!Array.isArray(req) || req.length!==3 || !['GET','HEAD'].includes(req[0]) ||\n      typeof req[1] !== 'string' || req[1].length>4096 || !req[1].startsWith('/') ||\n      typeof req[2] !== 'string' || req[2].length>128) return fail();\n  busy=true;\n  // Preserve node -e's argv contract exactly; the already-audited program is\n  // evaluated only in a fresh worker, not in the long-lived relay itself.\n  const w=new Worker('process.argv.splice(1,1);\\n'+program,\n    {eval:true,argv:req,stdout:true,stderr:true,resourceLimits:{maxOldGenerationSizeMb:128}});\n  let chunks=[], size=0, bad=false;\n  const timer=setTimeout(()=>{bad=true;w.terminate();},14000);\n  w.stdout.on('data', c=>{size+=c.length;if(size>limit){bad=true;w.terminate();}else chunks.push(c);});\n  w.stderr.resume();\n  w.on('error',()=>{bad=true;});\n  w.on('exit',code=>{\n    clearTimeout(timer);\n    if(code!==0 || bad) return fail();\n    let result;try { result=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail(); }\n    const out=Buffer.from(JSON.stringify(result)+'\\n');\n    if(out.length>limit) return fail();\n    busy=false;idle=setTimeout(() => process.exit(0),45000);process.stdout.write(out);\n  });\n});\nprocess.stdin.on('end',()=>process.exit(busy?2:0));\nprocess.stdin.on('error',fail);\n"

class LineProcess:
    """One request at a time, bounded IPC in both directions; no implicit retry."""
    def __init__(self, argv, limit, timeout):
        self.limit, self.timeout = limit, timeout
        self.p = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, bufsize=0)
        os.set_blocking(self.p.stdin.fileno(), False)
        os.set_blocking(self.p.stdout.fileno(), False)
    def exchange(self, value):
        raw = json.dumps(value, separators=(',', ':'), allow_nan=False).encode()+b'\n'
        if len(raw)>MAX_REQUEST or self.p.poll() is not None: raise RuntimeError('IPC_REQUEST_DENIED')
        deadline=time.monotonic()+self.timeout
        def wait(fd, events):
            with selectors.DefaultSelector() as sel:
                sel.register(fd,events)
                left=deadline-time.monotonic()
                if left<=0 or not sel.select(left): raise TimeoutError('IPC_DEADLINE')
        fd=self.p.stdin.fileno(); view=memoryview(raw)
        while view:
            wait(fd,selectors.EVENT_WRITE)
            try: count=os.write(fd,view)
            except BlockingIOError: continue
            if count<=0: raise RuntimeError('IPC_WRITE_FAILED')
            view=view[count:]
        chunks=bytearray(); fd=self.p.stdout.fileno()
        while True:
            wait(fd,selectors.EVENT_READ)
            try: part=os.read(fd,65536)
            except BlockingIOError: continue
            if not part: raise RuntimeError('IPC_EOF')
            chunks.extend(part)
            if len(chunks)>self.limit: raise RuntimeError('IPC_LIMIT')
            if b'\n' in part:
                if chunks.find(b'\n')!=len(chunks)-1: raise RuntimeError('IPC_EXTRA_DATA')
                return bytes(chunks[:-1])
    def close(self):
        self.p.stdin.close()
        try: self.p.wait(timeout=1)
        except subprocess.TimeoutExpired:
            self.p.terminate()
            try: self.p.wait(timeout=1)
            except subprocess.TimeoutExpired: self.p.kill();self.p.wait(timeout=2)
        finally: self.p.stdout.close()


class RuntimeRelay:
    def __init__(self, pilot, gateway):
        self.pilot,self.gateway=pilot,gateway
        self.current=None;self.channel=None
        self.starts=0;self.approved=None
    def close(self):
        channel=self.channel;self.channel=None;self.current=None
        if channel: channel.close()
    def fetch(self,d,name,path,method='GET',accept='*/*'):
        p=self.pilot
        if method not in ('GET','HEAD') or not p.safe_path(path): raise ValueError('RELAY_REQUEST_DENIED')
        # Use the exact container ID from the existing successful verification,
        # not a second lookup by a potentially reused container name.
        if self.approved is None or self.approved[:2]!=(str(p.ROOT),name): raise RuntimeError('RELAY_CONTAINER_NOT_VERIFIED')
        cid=self.approved[2]
        if not isinstance(cid,str) or not re.fullmatch('[a-f0-9]{64}',cid): raise RuntimeError('RELAY_CONTAINER_ID')
        key=(tuple(d),str(p.ROOT),name,cid)
        if key!=self.current or not self.channel or self.channel.p.poll() is not None:
            self.close()
            program=base64.b64encode(p.HTTP_PROGRAM.encode()).decode()
            self.channel=LineProcess(d+['exec','-i',cid,'node','-e',RELAY_PROGRAM,program,str(p.MAX_FILE*4//3+4096)],p.MAX_FILE*4//3+4096,16)
            self.current=key; self.starts+=1
        try:
            r=p.unique_json(self.channel.exchange([method,path,accept]))
            if not isinstance(r,dict) or set(r)!= {'status','contentType','location','body'}: raise ValueError('RELAY_RESPONSE_SHAPE')
            return self.gateway.decode(json.dumps([r['status'],r['contentType'],r['location'],r['body']],separators=(',',':')).encode())
        except BaseException:
            self.close();raise


def committed_guard(gateway,host,project):
    guard=gateway.serving_guard(host,project)
    return guard if guard is not None and guard[0]=='fenced' else None


class BoundWorker:
    """A single isolated process, one fixed project, no concurrent ROOT switching."""
    def __init__(self,project,pilot,gateway):
        if not pilot.ID.fullmatch(project): raise ValueError('PROJECT_ID')
        self.project,self.pilot,self.gateway=project,pilot,gateway
        self.root=pilot.ROOT;self.relay=RuntimeRelay(pilot,gateway)
    def close(self):self.relay.close()
    def request(self,host,method,path):
        p,g=self.pilot,self.gateway
        p.ROOT=self.root
        old=p.fetch;verify=p.verify_container
        self.relay.approved=None
        try:
            before=committed_guard(g,host,self.project)
            if before is None: self.relay.close();return None
            def verified(info,dist,digest,image_id,*args,**kwargs):
                result=verify(info,dist,digest,image_id,*args,**kwargs)
                if digest==before[1]['objectSha256'] and pathlib.Path(dist)==p.ROOT/digest/'dist':
                    self.relay.approved=(str(p.ROOT),p.deployment_name(digest),info.get('Id'))
                return result
            p.verify_container=verified
            p.fetch=self.relay.fetch
            result=g.worker(host,self.project,method,path,database_routes=True)
            p.ROOT=self.root
            if result is None or committed_guard(g,host,self.project)!=before:
                self.relay.close();return None
            return result
        except BaseException:
            self.relay.close();raise
        finally:
            p.fetch=old;p.verify_container=verify;p.ROOT=self.root;self.relay.approved=None


def worker_loop(project,pilot,gateway):
    worker=BoundWorker(project,pilot,gateway)
    try:
        while True:
            # No indefinite relay leak if the supervising process disappears.
            with selectors.DefaultSelector() as sel:
                sel.register(sys.stdin.buffer,selectors.EVENT_READ)
                if not sel.select(IDLE_SECONDS):return
            raw=sys.stdin.buffer.readline(MAX_REQUEST+1)
            if not raw:return
            if len(raw)>MAX_REQUEST or not raw.endswith(b'\n'):raise ValueError('WORKER_FRAME')
            req=pilot.unique_json(raw)
            if not isinstance(req,list) or len(req)!=3 or not all(isinstance(x,str) for x in req):raise ValueError('WORKER_REQUEST')
            result=worker.request(*req)
            sys.stdout.buffer.write(gateway.encode(result)+b'\n');sys.stdout.buffer.flush()
    finally:worker.close()


class WorkerPool:
    """Bounded project-specific sessions; no waiting queue and no retry on error."""
    def __init__(self,factory,decode):
        self.factory,self.decode=factory,decode
        self.lock=threading.Lock();self.sessions=[];self.closed=False
    def fetch(self,host,project,method,path):
        with self.lock:
            if self.closed:raise RuntimeError('POOL_CLOSED')
            now=time.monotonic()
            for item in list(self.sessions):
                if not item['busy'] and (now-item['last']>=IDLE_SECONDS or item['channel'].p.poll() is not None):
                    self.sessions.remove(item);item['channel'].close()
            item=next((i for i in self.sessions if i['project']==project and not i['busy']),None)
            if item is None:
                if len(self.sessions)>=MAX_SESSIONS or sum(i['project']==project for i in self.sessions)>=PER_PROJECT:raise RuntimeError('POOL_BUSY')
                item={'project':project,'channel':self.factory(project),'busy':False,'last':now};self.sessions.append(item)
            item['busy']=True
        failed=True
        try:
            result=self.decode(item['channel'].exchange([host,method,path]));failed=False;return result
        finally:
            with self.lock:
                if failed or self.closed:
                    if item in self.sessions:self.sessions.remove(item)
                    item['channel'].close()
                else:item['busy']=False;item['last']=time.monotonic()
    def close(self):
        with self.lock:
            self.closed=True
            for item in list(self.sessions):
                if not item['busy']:
                    self.sessions.remove(item);item['channel'].close()


def main():
    import control,hosted_gateway as gateway,pilot
    parser=argparse.ArgumentParser();mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--worker-project');mode.add_argument('--serve-candidate',action='store_true');args=parser.parse_args()
    control.configuration() # preserve development-only host guard
    if args.worker_project:
        worker_loop(args.worker_project,pilot,gateway);return
    path=str(pathlib.Path(__file__).resolve())
    pool=WorkerPool(lambda project:LineProcess([sys.executable,'-B',path,'--worker-project',project],pilot.MAX_FILE*4//3+4096,60),gateway.decode)
    try:
        with gateway.Gateway(('127.0.0.1',33109),{},fetch=pool.fetch,
                             lookup=lambda host:gateway.configured(True)[1].get(host),
                             guard=lambda h,p:committed_guard(gateway,h,p)) as server:
            server.serve_forever()
    finally:pool.close()

if __name__=='__main__':main()
