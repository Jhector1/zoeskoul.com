#!/usr/bin/env python3
from __future__ import annotations

import base64, contextlib, hashlib, json, os, secrets, time, uuid, webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

try:
    import jwt
except Exception:
    jwt = None

ISSUER = "https://auth.openai.com"
AUTHORIZE_URL = f"{ISSUER}/api/accounts/authorize"
TOKEN_URL = f"{ISSUER}/api/accounts/oauth/token"
DISCOVERY_URL = f"{ISSUER}/.well-known/openid-configuration"
JWKS_URL = f"{ISSUER}/.well-known/jwks.json"
RESOURCE = "https://api.openai.com/v1"
SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"
DYNAMIC_CLIENT_ID = "dynamic_agent_client"
CALLBACK_PATH = "/auth/callback"
APP_NAME = "ZoeSkoul Closure Agent"

CONFIG_HOME = Path(
    os.environ.get(
        "ZOESKOUL_AGENT_CONFIG_HOME",
        str(Path.home() / ".config" / "zoeskoul-closure-agent"),
    )
).expanduser()
HOST_FILE = CONFIG_HOME / "host.json"
PROFILE_FILE = CONFIG_HOME / "profile.json"


class AuthError(RuntimeError):
    pass


def _write_private(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp-" + secrets.token_hex(5))
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        os.replace(tmp, path)
        os.chmod(path, 0o600)
    finally:
        with contextlib.suppress(FileNotFoundError):
            tmp.unlink()


def _read(path: Path) -> Optional[dict[str, Any]]:
    try:
        value = json.loads(path.read_text())
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        raise AuthError(f"Invalid auth file {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise AuthError(f"Unexpected auth file format: {path}")
    return value


def load_profile() -> Optional[dict[str, Any]]:
    return _read(PROFILE_FILE)


def load_or_create_host_id() -> str:
    existing = _read(HOST_FILE)
    if existing and isinstance(existing.get("ext_agent_host_id"), str):
        return existing["ext_agent_host_id"]
    host_id = f"urn:uuid:{uuid.uuid4()}"
    _write_private(HOST_FILE, {"ext_agent_host_id": host_id, "created_at": int(time.time())})
    return host_id


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _pkce() -> tuple[str, str]:
    verifier = _b64url(secrets.token_bytes(48))
    challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    return verifier, challenge


def _post_form(url: str, form: dict[str, str], timeout: int = 30) -> dict[str, Any]:
    req = Request(
        url,
        data=urlencode(form).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
    except HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise AuthError(f"OAuth HTTP {exc.code}: {detail[:1000]}") from exc
    except URLError as exc:
        raise AuthError(f"OAuth network error: {exc}") from exc
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AuthError("OAuth endpoint returned invalid JSON.") from exc
    if not isinstance(value, dict):
        raise AuthError("OAuth endpoint returned an unexpected payload.")
    return value


def _get_json(url: str, bearer: str | None = None) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {bearer}"} if bearer else {}
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
    except HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise AuthError(f"HTTP {exc.code}: {detail[:1000]}") from exc
    except URLError as exc:
        raise AuthError(f"Network error: {exc}") from exc
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise AuthError(f"Unexpected JSON from {url}")
    return value


def _validate_id_token(token: str, client_id: str, nonce: str) -> dict[str, Any]:
    if jwt is None:
        raise AuthError("PyJWT is unavailable. Run tools/zoeskoul-agent/run.sh.")
    try:
        header = jwt.get_unverified_header(token)
        alg = str(header.get("alg", ""))
        if alg not in {"RS256", "PS256", "ES256"}:
            raise AuthError(f"Unexpected ID-token algorithm: {alg}")
        jwks = jwt.PyJWKClient(JWKS_URL)
        key = jwks.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=[alg],
            audience=client_id,
            issuer=ISSUER,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except AuthError:
        raise
    except Exception as exc:
        raise AuthError(f"ID-token validation failed: {exc}") from exc
    if claims.get("nonce") != nonce:
        raise AuthError("ID-token nonce mismatch.")
    return dict(claims)


def _scopes(value: Any) -> set[str]:
    if isinstance(value, str):
        return {x for x in value.split() if x}
    if isinstance(value, list):
        return {str(x) for x in value}
    return set()


class _Callback:
    query: Optional[dict[str, list[str]]] = None


def _make_server() -> tuple[HTTPServer, str, _Callback]:
    state = _Callback()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path != CALLBACK_PATH:
                self.send_response(404)
                self.end_headers()
                return
            state.query = parse_qs(parsed.query, keep_blank_values=True)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                b'<!doctype html><meta charset="utf-8"><title>ZoeSkoul</title>'
                b'<h2>ChatGPT connection received</h2>'
                b'<p>You can close this tab and return to Terminal.</p>'
            )

        def log_message(self, *_):
            return

    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = int(server.server_address[1])
    return server, f"http://127.0.0.1:{port}{CALLBACK_PATH}", state


def login(force_new: bool = False) -> dict[str, Any]:
    previous = None if force_new else load_profile()
    host_id = load_or_create_host_id()
    verifier, challenge = _pkce()
    oauth_state = _b64url(secrets.token_bytes(32))
    nonce = _b64url(secrets.token_bytes(32))
    server, redirect_uri, callback = _make_server()

    client_id = (
        str(previous["client_id"])
        if previous and previous.get("client_id")
        else DYNAMIC_CLIENT_ID
    )
    params = {
        "client_id": client_id,
        "ext_agent_host_id": host_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": SCOPES,
        "resource": RESOURCE,
        "state": oauth_state,
        "nonce": nonce,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
    }
    if client_id == DYNAMIC_CLIENT_ID:
        params["agent_name_hint"] = APP_NAME
    else:
        if previous and previous.get("id_token"):
            params["id_token_hint"] = str(previous["id_token"])
        if previous and previous.get("email"):
            params["login_hint"] = str(previous["email"])

    # Never print this URL; reauth can include id_token_hint.
    auth_url = AUTHORIZE_URL + "?" + urlencode(params)
    print("Opening the official ChatGPT authorization page...")
    print("Approve ChatGPT plan usage for ZoeSkoul Closure Agent.")
    webbrowser.open(auth_url, new=1, autoraise=True)

    server.timeout = 300
    server.handle_request()
    server.server_close()

    query = callback.query
    if not query:
        raise AuthError("Timed out waiting for the 127.0.0.1 OAuth callback.")
    returned_state = (query.get("state") or [""])[0]
    if not secrets.compare_digest(returned_state, oauth_state):
        raise AuthError("OAuth state mismatch.")
    if query.get("error"):
        raise AuthError(
            f"Authorization failed: {(query.get('error') or [''])[0]} "
            f"{(query.get('error_description') or [''])[0]}"
        )
    code = (query.get("code") or [""])[0]
    if not code:
        raise AuthError("Authorization callback did not include a code.")

    callback_client = (query.get("client_id") or [""])[0]
    if client_id == DYNAMIC_CLIENT_ID:
        if not callback_client:
            raise AuthError("Dynamic registration did not return an issued client_id.")
        issued_client_id = callback_client
    else:
        issued_client_id = client_id
        if callback_client and callback_client != issued_client_id:
            raise AuthError("Authorization returned a different client_id.")

    tokens = _post_form(
        TOKEN_URL,
        {
            "grant_type": "authorization_code",
            "client_id": issued_client_id,
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": redirect_uri,
            "resource": RESOURCE,
        },
    )

    id_token = tokens.get("id_token")
    if not isinstance(id_token, str) or not id_token:
        raise AuthError("Token exchange did not return an ID token.")
    claims = _validate_id_token(id_token, issued_client_id, nonce)

    if previous and previous.get("subject") and claims.get("sub") != previous.get("subject"):
        raise AuthError("Reauthorization returned a different ChatGPT account.")

    scopes = _scopes(tokens.get("scope"))
    required = {"chatgpt.tokens.use.direct", "resource.invoke"}
    if not required.issubset(scopes):
        raise AuthError(
            "ChatGPT plan usage was not fully granted. Run --login and approve plan usage."
        )

    access = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    if not isinstance(access, str) or not access:
        raise AuthError("Token exchange did not return an access token.")
    if not isinstance(refresh_token, str) or not refresh_token:
        raise AuthError("Token exchange did not return a refresh token.")

    saved_at = int(time.time())
    expires_in = int(tokens.get("expires_in", 3600))
    profile = {
        "email": claims.get("email"),
        "name": claims.get("name"),
        "issuer": claims.get("iss"),
        "subject": claims.get("sub"),
        "client_id": issued_client_id,
        "ext_agent_host_id": host_id,
        "id_token": id_token,
        "access_token": access,
        "refresh_token": refresh_token,
        "token_type": tokens.get("token_type", "Bearer"),
        "scopes": sorted(scopes),
        "saved_at": saved_at,
        "expires_in": expires_in,
        "expires_at": saved_at + expires_in,
    }
    _write_private(PROFILE_FILE, profile)
    print(f"ChatGPT connected: {profile.get('email') or '(email unavailable)'}")
    print("ChatGPT plan usage: ENABLED")
    return profile


def _needs_refresh(profile: dict[str, Any], skew: int = 120) -> bool:
    try:
        return time.time() >= int(profile.get("expires_at", 0)) - skew
    except Exception:
        return True


def refresh(profile: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    current = profile or load_profile()
    if not current:
        raise AuthError("No saved ChatGPT connection. Run --login.")
    client_id = str(current.get("client_id") or "")
    refresh_token = str(current.get("refresh_token") or "")
    if not client_id or not refresh_token:
        raise AuthError("Saved connection cannot refresh. Run --login.")

    tokens = _post_form(
        TOKEN_URL,
        {
            "grant_type": "refresh_token",
            "client_id": client_id,
            "refresh_token": refresh_token,
            "resource": RESOURCE,
        },
    )
    access = tokens.get("access_token")
    if not isinstance(access, str) or not access:
        raise AuthError("Refresh did not return an access token.")

    updated = dict(current)
    saved_at = int(time.time())
    expires_in = int(tokens.get("expires_in", current.get("expires_in", 3600)))
    updated["access_token"] = access
    updated["refresh_token"] = tokens.get("refresh_token") or current["refresh_token"]
    updated["token_type"] = tokens.get("token_type") or current.get("token_type", "Bearer")
    updated["saved_at"] = saved_at
    updated["expires_in"] = expires_in
    updated["expires_at"] = saved_at + expires_in
    if tokens.get("scope"):
        granted = _scopes(tokens["scope"])
        if "chatgpt.tokens.use.direct" not in granted:
            raise AuthError("Refreshed grant lost ChatGPT plan usage permission.")
        updated["scopes"] = sorted(granted)

    _write_private(PROFILE_FILE, updated)
    return updated


def ensure_access_token() -> str:
    profile = load_profile()
    if not profile:
        profile = login()
    elif _needs_refresh(profile):
        try:
            profile = refresh(profile)
        except AuthError:
            print("Saved ChatGPT session needs reauthorization.")
            profile = login()
    token = profile.get("access_token")
    if not isinstance(token, str) or not token:
        raise AuthError("No usable ChatGPT access token.")
    return token


def auth_status() -> int:
    profile = load_profile()
    if not profile:
        print("chatgpt_connection=NOT_CONNECTED")
        print(f"credentials={PROFILE_FILE}")
        return 1
    scopes = _scopes(profile.get("scopes"))
    print("chatgpt_connection=CONNECTED")
    print(f"email={profile.get('email') or '(unavailable)'}")
    print(f"client_id={profile.get('client_id') or '(unavailable)'}")
    print(f"plan_usage_scope={'ENABLED' if 'chatgpt.tokens.use.direct' in scopes else 'MISSING'}")
    print(f"token_refresh_needed={'YES' if _needs_refresh(profile) else 'NO'}")
    print(f"credentials={PROFILE_FILE}")
    return 0


def logout() -> None:
    profile = load_profile()
    if not profile:
        print("chatgpt_connection=NOT_CONNECTED")
        return

    remote = False
    try:
        discovery = _get_json(DISCOVERY_URL)
        endpoint = discovery.get("revocation_endpoint")
        if endpoint and profile.get("refresh_token") and profile.get("client_id"):
            req = Request(
                str(endpoint),
                data=urlencode(
                    {
                        "token": str(profile["refresh_token"]),
                        "token_type_hint": "refresh_token",
                        "client_id": str(profile["client_id"]),
                    }
                ).encode(),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                method="POST",
            )
            with urlopen(req, timeout=30) as resp:
                remote = int(resp.status) == 200
    except Exception:
        remote = False

    with contextlib.suppress(FileNotFoundError):
        PROFILE_FILE.unlink()
    print("local_chatgpt_tokens=CLEARED")
    print(f"remote_revocation_confirmed={'YES' if remote else 'NO'}")


def list_models(access_token: str) -> list[dict[str, str]]:
    payload = _get_json(f"{RESOURCE}/models", bearer=access_token)
    raw = payload.get("models")
    if not isinstance(raw, list):
        raw = payload.get("data")
    if not isinstance(raw, list):
        raise AuthError("Model catalog returned an unexpected payload.")
    result: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        if item.get("visibility") not in (None, "list"):
            continue
        slug = item.get("slug") or item.get("id")
        if isinstance(slug, str) and slug:
            result.append(
                {
                    "slug": slug,
                    "display_name": str(item.get("display_name") or slug),
                }
            )
    return result


def choose_model(access_token: str, preferred: list[str]) -> str:
    models = list_models(access_token)
    available = [m["slug"] for m in models]
    forced = os.environ.get("ZOESKOUL_AGENT_MODEL")
    if forced:
        if forced not in available:
            raise AuthError(f"Requested model {forced!r} is not available to this ChatGPT account.")
        return forced
    for candidate in preferred:
        if candidate in available:
            return candidate
    if not available:
        raise AuthError("No listable models are available to this ChatGPT account.")
    return available[0]
