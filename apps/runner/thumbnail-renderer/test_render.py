"""Trusted synthetic fixture, no real projects, secrets, Docker or network calls."""
import base64
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path
from PIL import Image
from render import relay_accept, stylesheet_mime_ok

ROOT=Path(__file__).resolve().parent
BASE="/__zoebuild_dev_preview_public_base__/"

class RenderTest(unittest.TestCase):
    def capture(self, broken=False, wrong_css=False):
        html=f'''<!doctype html><html><head><link rel="stylesheet" href="{BASE}style.css"></head>
        <body><h1>Fixture homepage</h1><img src="{BASE}sample.png"><img src="https://external.invalid/never">
        <script type="module" src="{BASE}app.js"></script></body></html>'''.encode()
        image=io.BytesIO(); Image.new("RGB",(100,80),(10,90,200)).save(image,format="PNG")
        replies={"":("text/html",html),"style.css":("text/css",b"@import \"nested.css\"; img{width:100px}"),"nested.css":("text/css",b"body{background:#ef8060;font-size:48px}"),"module.css?import":("application/javascript",b"export default true;"),"sample.png":("image/png",image.getvalue()),"app.js":("application/javascript",b"import './module.css?import'; document.querySelector('h1').textContent='Rendered homepage'" if not broken else b"throw Error('broken')")}
        seen=[]; jpeg=None; failed=False
        with subprocess.Popen([sys.executable,"-u",str(ROOT/"render.py")],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True) as p:
            try:
                for line in p.stdout:
                    msg=json.loads(line)
                    if msg["kind"]=="ready":
                        p.stdin.write('{"kind":"start"}\n');p.stdin.flush()
                    elif msg["kind"]=="get":
                        path=msg["path"];seen.append(path)
                        accept=msg["accept"]
                        self.assertEqual(accept,"text/css" if path in ("style.css","nested.css") else "*/*")
                        if path in replies:
                            mime,body=replies[path]
                            if wrong_css and path=="style.css":mime,body="application/javascript",b"export default true;"
                            reply={"status":200,"contentType":mime,"bodyBase64":base64.b64encode(body).decode()}
                        else:reply={"status":404}
                        p.stdin.write(json.dumps(reply)+"\n");p.stdin.flush()
                    elif msg["kind"]=="jpeg":jpeg=base64.b64decode(msg["bodyBase64"])
                    elif msg["kind"]=="failed":failed=True
                p.wait(timeout=10)
            finally:
                if p.poll() is None:p.kill()
        self.assertFalse(any("external.invalid" in p for p in seen))
        self.assertIn("",seen);self.assertIn("style.css",seen)
        if not wrong_css: self.assertIn("sample.png",seen);self.assertIn("app.js",seen)
        if not wrong_css and not broken:
            self.assertIn("nested.css",seen);self.assertIn("module.css?import",seen)
        return jpeg,failed
    def test_actual_render(self):
        jpeg,failed=self.capture();self.assertFalse(failed);self.assertIsNotNone(jpeg)
        image=Image.open(io.BytesIO(jpeg));self.assertEqual(image.size,(1280,720))
        r,g,b=image.getpixel((1000,600));self.assertGreater(r,210);self.assertLess(g,150);self.assertLess(b,120)
        self.assertLess(len(jpeg),512*1024)
    def test_accept_and_mime_contract(self):
        self.assertEqual(relay_accept("stylesheet"),"text/css")
        for kind in ("script","document","image","font"):
            self.assertEqual(relay_accept(kind),"*/*")
        self.assertTrue(stylesheet_mime_ok("stylesheet","text/css; charset=utf-8"))
        self.assertFalse(stylesheet_mime_ok("stylesheet","application/javascript"))
        self.assertFalse(stylesheet_mime_ok("stylesheet",None))
        self.assertTrue(stylesheet_mime_ok("script","application/javascript"))
    def test_wrong_stylesheet_mime_not_cached(self):
        jpeg,failed=self.capture(wrong_css=True);self.assertTrue(failed);self.assertIsNone(jpeg)
    def test_script_failure_not_cached(self):
        jpeg,failed=self.capture(broken=True);self.assertTrue(failed);self.assertIsNone(jpeg)

if __name__=="__main__":unittest.main()
