"""Offline thumbnail renderer v3: bounded resource negotiation and stylesheet integrity."""
import asyncio
import base64
import json
import signal
import sys
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

ORIGIN = "http://preview.invalid"
BASE = "/__zoebuild_dev_preview_public_base__/"
MAX_REPLY = 9 * 1024 * 1024
MAX_JPEG = 512 * 1024


def send(value):
    print(json.dumps(value, separators=(",", ":")), flush=True)


def mark(phase):
    print("ZOE_FIXTURE_STAGE=" + phase, file=sys.stderr, flush=True)


def relay_path(url, method, is_navigation):
    u = urlsplit(url)
    if (u.scheme, u.netloc) != ("http", "preview.invalid") or method != "GET":
        return None
    if is_navigation and url != ORIGIN + BASE:
        return None
    relative = u.path[len(BASE):] if u.path.startswith(BASE) else u.path.lstrip("/")
    if u.query:
        relative += "?" + u.query
    return relative if len(relative) <= 4096 else None


def relay_accept(resource_type):
    # Match the existing authenticated preview's two-value Accept contract.
    # CSS imported as a JS module must retain */*, not text/css.
    return "text/css" if resource_type == "stylesheet" else "*/*"


def stylesheet_mime_ok(resource_type, content_type):
    return resource_type != "stylesheet" or (
        isinstance(content_type, str) and content_type.split(";", 1)[0].strip().lower() == "text/css"
    )


async def render():
    signal.alarm(45)
    mark("python_started")
    # One bounded stdin reader; no synchronous pipe reads inside browser callbacks.
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader(limit=MAX_REPLY)
    transport, _ = await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin.buffer)
    try:
        send({"kind": "ready"})
        ack = await asyncio.wait_for(reader.readline(), 5)
        if ack != b'{"kind":"start"}\n':
            raise ValueError("handshake")
        mark("ready_acknowledged")
        lock = asyncio.Lock()
        async with async_playwright() as p:
            mark("chromium_launch")
            browser = await p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, chromium_sandbox=True,
                args=["--disable-dev-shm-usage", "--disable-background-networking"])
            try:
                mark("context_create")
                context = await browser.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=1,
                    service_workers="block", accept_downloads=False)
                failed = False
                websocket_seen = False
                async def relay(route):
                    nonlocal failed
                    req = route.request
                    relative = relay_path(req.url, req.method, req.is_navigation_request())
                    if relative is None:
                        await route.abort(); return
                    try:
                        # Preserve exactly one in-flight GET/reply; no protocol multiplexing.
                        async with lock:
                            send({"kind": "get", "path": relative, "accept": relay_accept(req.resource_type)})
                            raw = await reader.readline()
                            if not raw or len(raw) > MAX_REPLY or not raw.endswith(b"\n"):
                                raise ValueError("relay")
                            response = json.loads(raw)
                            if response.get("status") != 200:
                                if req.resource_type in ("document", "script", "stylesheet", "image", "font"):
                                    failed = True
                                await route.abort(); return
                            if not stylesheet_mime_ok(req.resource_type, response.get("contentType")):
                                failed = True
                                mark("stylesheet_mime_rejected")
                                await route.abort(); return
                            body = base64.b64decode(response["bodyBase64"], validate=True)
                        await route.fulfill(status=200, content_type=response["contentType"], body=body)
                    except Exception:
                        failed = True
                        try:
                            await route.abort()
                        except Exception:
                            pass
                async def block_websocket(ws):
                    nonlocal failed, websocket_seen
                    first = not websocket_seen
                    websocket_seen = True
                    if first:
                        mark("websocket_callback_entered")
                    try:
                        await asyncio.wait_for(ws.close(), 5)
                        if first:
                            mark("websocket_closed")
                    except Exception:
                        failed = True
                mark("route_registration")
                await context.route("**/*", relay)
                await context.route_web_socket("**/*", block_websocket)
                mark("page_create")
                page = await asyncio.wait_for(context.new_page(), 12)
                def page_error(_):
                    nonlocal failed
                    failed = True
                page.on("pageerror", page_error)
                mark("navigation_start")
                response = await page.goto(ORIGIN + BASE, wait_until="load", timeout=30000)
                if response is None or not response.ok:
                    raise ValueError("document")
                mark("navigation_return")
                await page.wait_for_timeout(900)
                if failed or page.url != ORIGIN + BASE or not await page.locator("body").is_visible() or not await page.evaluate("Boolean(document.body.innerText.trim() || document.querySelector('canvas,svg,img,video'))"):
                    raise ValueError("incomplete")
                mark("screenshot_start")
                data = await page.screenshot(type="jpeg", quality=78, animations="disabled", timeout=5000)
                if failed or not 0 < len(data) <= MAX_JPEG:
                    raise ValueError("size or incomplete")
                mark("jpeg_send")
                send({"kind": "jpeg", "bodyBase64": base64.b64encode(data).decode("ascii")})
            finally:
                await browser.close()
    finally:
        transport.close()


if __name__ == "__main__":
    try:
        asyncio.run(render())
    except Exception:
        mark("renderer_failed")
        send({"kind": "failed"})
        sys.exit(1)
