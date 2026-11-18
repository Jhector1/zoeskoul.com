/** Python stdlib-only, isolated WebSocket worker. The sandbox has no network
 * interface and the worker can connect only to its own Vite loopback port.
 * Docker streams newline-delimited, bounded, base64-encoded application
 * messages. This is not an HTTP proxy and does not accept arbitrary URLs. */
export const TANSTACK_PREVIEW_HMR_WORKER = String.raw`
import base64, hashlib, http.client, json, os, re, socket, struct, sys, threading, time, urllib.parse

LIMIT=65536
CLIENT_LIMIT=524288
LIFETIME=110
PATH=re.compile(r'^/api/build/projects/[A-Za-z0-9_-]+/preview/preview_[a-f0-9-]+/content/[A-Za-z0-9_-]{32}/$')
TOKEN=re.compile(r'(?m)^const wsToken = "([A-Za-z0-9_-]{12})";$')
WRITE_LOCK=threading.Lock()
STOP=threading.Event()

def reply(event, value=None):
    item={'event':event}
    if value is not None: item['data']=base64.b64encode(value).decode('ascii')
    with WRITE_LOCK:
        sys.stdout.write(json.dumps(item, separators=(',', ':'))+'\n')
        sys.stdout.flush()

def exact(sock, size):
    result=bytearray()
    while len(result)<size and not STOP.is_set():
        piece=sock.recv(size-len(result))
        if not piece: raise EOFError()
        result.extend(piece)
    if len(result)!=size: raise EOFError()
    return bytes(result)

def write_frame(sock, opcode, content):
    if not isinstance(content, bytes) or len(content)>LIMIT: raise ValueError()
    key=os.urandom(4)
    size=len(content)
    head=bytes([0x80 | opcode, 0x80 | size]) if size<126 else bytes([0x80 | opcode, 0x80 | 126])+struct.pack('!H',size)
    masked=bytes(c ^ key[i%4] for i,c in enumerate(content))
    sock.sendall(head+key+masked)

def vite_ws_token(path):
    connection=http.client.HTTPConnection('127.0.0.1',5173,timeout=5)
    try:
        connection.request('GET',path+'@vite/client',headers={
            'Host':'127.0.0.1:5173',
            'Accept':'text/javascript',
        })
        response=connection.getresponse()
        body=response.read(CLIENT_LIMIT+1)
        if response.status!=200 or len(body)>CLIENT_LIMIT: raise ValueError()
        matches=TOKEN.findall(body.decode('utf8','strict'))
        if len(matches)!=1: raise ValueError()
        return matches[0]
    finally:
        connection.close()

def from_browser(sock):
    try:
        for line in sys.stdin:
            if STOP.is_set(): break
            if len(line)>90000: break
            item=json.loads(line)
            if not isinstance(item,dict): break
            if item.get('event')=='close': break
            if item.get('event')!='text' or set(item)!=set(('event','data')): break
            raw=item['data']
            if not isinstance(raw,str) or len(raw)>88000: break
            body=base64.b64decode(raw,validate=True)
            if len(body)>LIMIT: break
            body.decode('utf8','strict')
            write_frame(sock,1,body)
    except Exception: pass
    finally:
        STOP.set()
        try: sock.shutdown(socket.SHUT_RDWR)
        except Exception: pass

def main():
    line=sys.stdin.readline(1024)
    item=json.loads(line)
    if not isinstance(item,dict) or set(item)!=set(('path',)) or not isinstance(item['path'],str) or not PATH.fullmatch(item['path']):
        raise ValueError()
    path=item['path']
    token=vite_ws_token(path)
    sock=socket.create_connection(('127.0.0.1',5173),timeout=5)
    try:
        key=base64.b64encode(os.urandom(16)).decode('ascii')
        request_path=path+'?token='+urllib.parse.quote(token,safe='')
        request=('GET '+request_path+' HTTP/1.1\r\nHost: 127.0.0.1:5173\r\n'
                 'Connection: Upgrade\r\nUpgrade: websocket\r\n'
                 'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: '+key+'\r\n'
                 'Sec-WebSocket-Protocol: vite-hmr\r\nOrigin: http://127.0.0.1:5173\r\n\r\n')
        sock.sendall(request.encode('ascii'))
        header=b''
        while b'\r\n\r\n' not in header:
            if len(header)>8192: raise ValueError()
            header+=exact(sock,1)
        lines=header.decode('iso-8859-1').split('\r\n')
        if lines[0]!='HTTP/1.1 101 Switching Protocols': raise ValueError()
        fields={a.strip().lower():b.strip() for a,b in (line.split(':',1) for line in lines[1:] if ':' in line)}
        expected=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode('ascii')).digest()).decode('ascii')
        if fields.get('sec-websocket-accept')!=expected or fields.get('upgrade','').lower()!='websocket': raise ValueError()
        sock.settimeout(2)
        reply('ready')
        thread=threading.Thread(target=from_browser,args=(sock,),daemon=True)
        thread.start()
        deadline=time.monotonic()+LIFETIME
        data=bytearray()
        collecting=False
        while not STOP.is_set() and time.monotonic()<deadline:
            try: first=exact(sock,2)
            except socket.timeout: continue
            fin=bool(first[0]&0x80)
            opcode=first[0]&0x0f
            if first[0]&0x70 or first[1]&0x80: raise ValueError()
            size=first[1]&0x7f
            if size==126: size=struct.unpack('!H',exact(sock,2))[0]
            elif size==127: size=struct.unpack('!Q',exact(sock,8))[0]
            if size>LIMIT or size+len(data)>LIMIT: raise ValueError()
            body=exact(sock,size)
            if opcode==8: break
            if opcode==9:
                if size>125 or not fin: raise ValueError()
                write_frame(sock,10,body)
                continue
            if opcode==10: continue
            if opcode==1:
                if collecting: raise ValueError()
                data.clear();data.extend(body);collecting=True
            elif opcode==0:
                if not collecting: raise ValueError()
                data.extend(body)
            else: raise ValueError()
            if fin:
                body=bytes(data)
                body.decode('utf8','strict')
                reply('text',body)
                collecting=False;data.clear()
    finally:
        STOP.set()
        try: sock.close()
        except Exception: pass

try: main()
except Exception: pass
finally:
    try: reply('closed')
    except Exception: pass
`;
