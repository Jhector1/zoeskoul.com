import { docker } from "../docker/dockerClient.js";
import type { UnifiedLinuxTerminal, UnifiedPythonProgram } from "./unifiedLinuxEnvironmentManager.js";
import { Duplex } from "node:stream";
import { validWorkspacePath, validWorkspaceRevision } from "./unifiedLinuxWorkspaceRead.js";
const PYTHON_PROGRAM = "import base64, hashlib, os, re, select, signal, stat, subprocess, sys, termios\nROOT = '/workspace'\nMAX = 32768\n\ndef verified(path, revision):\n    parts = path.split('/')\n    if len(path)>128 or len(parts)>8 or not path.endswith('.py') or not all(re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_. -]{0,63}', p) and p not in ('node_modules','__pycache__') for p in parts):\n        raise ValueError('invalid path')\n    if not re.fullmatch(r'sha256:[a-f0-9]{64}', revision):\n        raise ValueError('invalid revision')\n    flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC\n    fd=os.open(ROOT,flags)\n    try:\n        dev=os.fstat(fd).st_dev\n        for part in parts[:-1]:\n            child=os.open(part,flags,dir_fd=fd)\n            if os.fstat(child).st_dev!=dev:\n                os.close(child); raise ValueError('mount')\n            os.close(fd); fd=child\n        f=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC,dir_fd=fd)\n        try:\n            def signature(s):\n                return (s.st_dev,s.st_ino,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)\n            before=os.fstat(f)\n            if not stat.S_ISREG(before.st_mode) or before.st_dev!=dev or before.st_nlink!=1 or before.st_size>MAX:\n                raise ValueError('invalid file')\n            data=b''\n            while len(data)<=MAX:\n                chunk=os.read(f,MAX+1-len(data))\n                if not chunk: break\n                data+=chunk\n            if len(data)>MAX or signature(before)!=signature(os.fstat(f)) or signature(before)!=signature(os.stat(parts[-1],dir_fd=fd,follow_symlinks=False)):\n                raise ValueError('changed file')\n            if b'\\0' in data or 'sha256:'+hashlib.sha256(data).hexdigest()!=revision:\n                raise ValueError('changed revision')\n            data.decode('utf-8','strict')\n            return data\n        finally: os.close(f)\n    finally: os.close(fd)\n\n\n# Execution begins only after the trusted Runner has accepted a browser PTY\n# connection and writes one blank line to this TTY. No stdout readiness marker\n# is necessary, and a missed startup marker cannot prevent Python execution.\n# The private transport never sends the start line to an ordinary shell.\ndef await_runner_start():\n    fd = sys.stdin.fileno()\n    if not os.isatty(fd):\n        return False\n    original = termios.tcgetattr(fd)\n    muted = original[:]\n    muted[3] &= ~termios.ECHO\n    termios.tcsetattr(fd, termios.TCSANOW, muted)\n    previous_alarm = signal.getsignal(signal.SIGALRM)\n    def deadline(_signum, _frame):\n        raise TimeoutError('python start deadline')\n    try:\n        signal.signal(signal.SIGALRM, deadline)\n        signal.alarm(30)\n        # The kernel TTY buffers an early LF; it is safe if received before this\n        # read. Exactly one authorized connection dispatches the single LF.\n        return sys.stdin.buffer.readline(16) == b'\\n'\n    except (TimeoutError, OSError, ValueError):\n        return False\n    finally:\n        signal.alarm(0)\n        signal.signal(signal.SIGALRM, previous_alarm)\n        termios.tcsetattr(fd, termios.TCSANOW, original)\n\ndef main():\n    # The authenticated transport archives a bounded completed transcript and\n    # reaps the verified PTY. Never retain an idle process just for output.\n    signal.signal(signal.SIGINT, lambda *_: None)\n    if not await_runner_start():\n        print(\"[Python run not started: no authorized terminal attachment]\", flush=True)\n        return\n    try:\n        path,revision=sys.argv[1:]\n        data=verified(path,revision)\n    except (OSError, ValueError, UnicodeError):\n        print('[Run blocked: selected file changed or is unavailable. Refresh and run again.]',flush=True)\n    else:\n        filename=os.path.join(ROOT,path)\n        print('[Running '+path+']',flush=True)\n        # A new Python interpreter preserves ordinary SystemExit, atexit and\n        # thread shutdown behavior. No shell expansion; exact verified bytes.\n        child = \"import base64, os, sys, types\\nfilename, encoded = sys.argv[1:]\\ndata = base64.b64decode(encoded, validate=True)\\nsys.argv = [filename]\\nsys.path.insert(0, os.path.dirname(filename))\\nmodule = types.ModuleType('__main__')\\nmodule.__file__ = filename\\nmodule.__package__ = None\\nsys.modules['__main__'] = module\\nexec(compile(data, filename, 'exec'), module.__dict__)\\n\"\n        try:\n            proc=subprocess.Popen([sys.executable,'-I','-u','-B','-c',child,filename,base64.b64encode(data).decode('ascii')])\n            code=proc.wait()\n            if code<0: code=128-code\n            print('[Python exited with code '+str(code)+']',flush=True)\n        except OSError:\n            print('[Python launch failed in guest]',flush=True)\n\nif __name__=='__main__': main()\n";
export function unifiedTerminalCommand(program?:UnifiedPythonProgram):string[]{
  if(program===undefined)return ["/bin/bash","-i"];
  if(!program||Object.keys(program).length!==2||!validWorkspacePath(program.path)||!program.path.endsWith(".py")||!validWorkspaceRevision(program.expectedRevision))throw Error("INVALID_PYTHON_PROGRAM");
  return ["/usr/bin/python3","-I","-u","-B","-c",PYTHON_PROGRAM,program.path,program.expectedRevision];
}
/** Internal offline experiment only. No client selects container, user or command.
 * Docker exec is independent of guest PID 1; disconnect never removes the guest. */
export async function openUnifiedDockerTerminal(containerId:string,authorize:()=>Promise<void>,program?:UnifiedPythonProgram):Promise<UnifiedLinuxTerminal>{
  if(!/^([a-f0-9]{64})$/.test(containerId))throw Error("TERMINAL_CONTAINER_ID_INVALID");
  const command=unifiedTerminalCommand(program);
  await authorize();
  const exec=await docker.getContainer(containerId).exec({
    Cmd:command,User:"sandbox",WorkingDir:"/workspace",Tty:true,
    AttachStdin:true,AttachStdout:true,AttachStderr:true,Privileged:false,
    Env:["TERM=xterm-256color"],
  });
  await authorize();
  const stream=await exec.start({hijack:true,stdin:true});
  // docker-modem's hijacked connection is a duplex socket. Refuse any other
  // transport rather than accidentally treating a noninteractive stream as PTY.
  if(!(stream instanceof Duplex))throw Error("TERMINAL_TRANSPORT_UNVERIFIED");
  stream.on("error",()=>{}); // disconnect/error cannot free the process slot
  try {
    await authorize();
    const state=await exec.inspect();
    if(state.ContainerID!==containerId||state.Running!==true)throw Error("TERMINAL_EXEC_UNVERIFIED");
    await authorize();
    return Object.freeze({stream,
      disconnect:()=>{stream.destroy();},
      resize:async(rows:number,cols:number)=>{
        if(![rows,cols].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=500))throw Error("TERMINAL_SIZE_INVALID");
        await authorize();await exec.resize({h:rows,w:cols});
      },
      exited:async()=>{const i=await exec.inspect();return i.ContainerID===containerId&&i.Running===false;},
    });
  }catch(error){stream.destroy();throw error;}
}
