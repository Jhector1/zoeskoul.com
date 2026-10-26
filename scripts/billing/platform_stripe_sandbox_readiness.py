#!/usr/bin/env python3
"""Offline, non-mutating preflight for ZoeSkoul/ZoeBuild platform Stripe sandbox.

No Stripe, DB, network, shell execution, environment mutation, Prisma, or secrets output.
Reads only an explicit allowlist of variables from candidate local env files.
A passing result is local configuration evidence, NOT Stripe account verification.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

ALLOW = frozenset({
    'LEARNOIR_STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'ZOEBUILD_AI_STRIPE_PRICE_IDS', 'STRIPE_PRICE_MONTHLY_ID',
    'STRIPE_PRICE_YEARLY_ID', 'AUTH_URL',
    'NEXT_PUBLIC_WEBSITE_ORIGIN', 'WEBSITE_ORIGIN',
    'NEXT_PUBLIC_ZOEBUILD_ORIGIN', 'ZOEBUILD_ORIGIN',
})
PRICE_RE = re.compile(r'^price_[A-Za-z0-9_]+$')
ASSIGN_RE = re.compile(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$')

@dataclass(frozen=True)
class Loaded:
    values: dict[str, str]
    conflicts: tuple[str, ...]
    files: int


def parse_value(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith(('"', "'")):
        quote = raw[0]
        ending = raw.find(quote, 1)
        if ending < 0 or raw[ending + 1:].strip() not in ('',) and not raw[ending + 1:].lstrip().startswith('#'):
            raise ValueError('Malformed quoted configuration value')
        value = raw[1:ending]
    else:
        value = re.split(r'\s+#', raw, maxsplit=1)[0].strip()
    if '$(' in value or '${' in value or '\n' in value or '\r' in value or value.startswith('`'):
        raise ValueError('Dynamic or malformed configuration value; use an explicit static snapshot')
    return value


def load_allowed(repo: Path, relative_files: list[str]) -> Loaded:
    values: dict[str, str] = {}
    conflicts: set[str] = set()
    read_count = 0
    for rel in relative_files:
        file = Path(rel)
        if file.is_absolute() or '..' in file.parts or '\\' in rel:
            raise ValueError('Refusing unsafe or external configuration path')
        full = repo / file
        if full.is_symlink():
            raise ValueError('Refusing symlinked configuration file')
        if not full.exists():
            continue
        if not full.is_file():
            raise ValueError('Configuration source is not a file')
        read_count += 1
        seen: set[str] = set()
        for line in full.read_text(encoding='utf8').splitlines():
            m = ASSIGN_RE.match(line)
            if not m or m.group(1) not in ALLOW:
                continue
            key = m.group(1)
            if key in seen:
                conflicts.add(key)
            seen.add(key)
            try:
                value = parse_value(m.group(2))
            except ValueError:
                raise ValueError('Invalid syntax for allowed config key ' + key) from None
            if key in values and values[key] != value:
                conflicts.add(key)
            values[key] = value
    return Loaded(values, tuple(sorted(conflicts)), read_count)


def key_mode(value: str | None) -> str:
    if not value:
        return 'MISSING'
    if re.fullmatch(r'sk_test_[A-Za-z0-9_]+', value):
        return 'TEST'
    if re.fullmatch(r'sk_live_[A-Za-z0-9_]+', value):
        return 'LIVE_BLOCKED'
    return 'INVALID'


def price_set(raw: str | None) -> tuple[set[str], bool]:
    if not raw or not raw.strip():
        return set(), False
    ids = [part.strip() for part in raw.split(',')]
    valid = all(PRICE_RE.fullmatch(value) for value in ids)
    return set(ids), bool(valid and len(ids) == len(set(ids)))


def valid_origin(value: str | None, *, allow_local_http: bool = True) -> bool:
    if not value:
        return False
    try:
        u = urlsplit(value)
        local = u.hostname in ('localhost', '127.0.0.1', '::1')
        return bool(
            (u.scheme == 'https' or (allow_local_http and u.scheme == 'http' and local))
            and u.hostname and not u.username and not u.password and not u.path.strip('/')
            and not u.query and not u.fragment
        )
    except ValueError:
        return False


def origin(values: dict[str, str], public_name: str, server_name: str) -> str | None:
    return values.get(public_name) or values.get(server_name)


def analyze(web: Loaded, builder: Loaded) -> tuple[list[str], list[str]]:
    """Return non-sensitive, stable findings and blocking codes; never return secrets."""
    info: list[str] = []
    errors: list[str] = []
    info.extend([f'WEB_SOURCE_FILES={web.files}', f'BUILDER_SOURCE_FILES={builder.files}'])
    for label, snap in [('WEB', web), ('BUILDER', builder)]:
        mode = key_mode(snap.values.get('LEARNOIR_STRIPE_SECRET_KEY'))
        info.append(f'{label}_PLATFORM_KEY_MODE={mode}')
        if mode != 'TEST':
            errors.append(f'{label}_TEST_KEY_REQUIRED')
        if snap.conflicts:
            for key in snap.conflicts:
                info.append(f'{label}_AMBIGUOUS_KEY={key}')
            errors.append(f'{label}_CONFIG_AMBIGUOUS')
    a = web.values.get('LEARNOIR_STRIPE_SECRET_KEY')
    b = builder.values.get('LEARNOIR_STRIPE_SECRET_KEY')
    same_key = bool(a and b and a == b)
    info.append('PLATFORM_KEY_EQUAL=' + ('YES' if same_key else 'NO_OR_UNKNOWN'))
    if not same_key:
        errors.append('PLATFORM_KEYS_DIFFER_OR_MISSING')
    wh = web.values.get('STRIPE_WEBHOOK_SECRET', '')
    valid_hook = bool(re.fullmatch(r'whsec_[A-Za-z0-9_]+', wh))
    info.append('WEB_WEBHOOK_SECRET=' + ('PRESENT_FORMAT_OK' if valid_hook else 'MISSING_OR_INVALID'))
    if not valid_hook:
        errors.append('WEB_WEBHOOK_SECRET_REQUIRED')
    wp, wvalid = price_set(web.values.get('ZOEBUILD_AI_STRIPE_PRICE_IDS'))
    bp, bvalid = price_set(builder.values.get('ZOEBUILD_AI_STRIPE_PRICE_IDS'))
    info.extend([f'WEB_BUILDER_PRICE_COUNT={len(wp)}', f'BUILDER_PRICE_COUNT={len(bp)}'])
    mapping_ok = bool(wvalid and bvalid and wp and bp and wp == bp)
    info.append('BUILDER_PRICE_REGISTRY_EQUAL=' + ('YES' if mapping_ok else 'NO_OR_UNKNOWN'))
    if not mapping_ok:
        errors.append('BUILDER_PRICES_INVALID_OR_DIFFERENT')
    for label, snap in [('WEB', web), ('BUILDER', builder)]:
        monthly = snap.values.get('STRIPE_PRICE_MONTHLY_ID', '').strip()
        yearly = snap.values.get('STRIPE_PRICE_YEARLY_ID', '').strip()
        learning = {x for x in (monthly, yearly) if x}
        if any(not PRICE_RE.fullmatch(x) for x in learning) or (monthly and yearly and monthly == yearly):
            errors.append(label + '_LEARNING_PRICE_MAP_INVALID')
        if learning & (wp if label == 'WEB' else bp):
            errors.append(label + '_CROSS_PRODUCT_PRICE_COLLISION')
        info.append(label + '_LEARNING_PRICE_COUNT=' + str(len(learning)))
    auth = web.values.get('AUTH_URL')
    if not valid_origin(auth):
        errors.append('WEB_AUTH_URL_MISSING_OR_INVALID')
    info.append('WEB_AUTH_ORIGIN=' + ('VALID' if valid_origin(auth) else 'MISSING_OR_INVALID'))
    web_origin = origin(builder.values, 'NEXT_PUBLIC_WEBSITE_ORIGIN', 'WEBSITE_ORIGIN')
    builder_origin = origin(builder.values, 'NEXT_PUBLIC_ZOEBUILD_ORIGIN', 'ZOEBUILD_ORIGIN')
    info.append('BUILDER_WEBSITE_ORIGIN=' + ('VALID' if valid_origin(web_origin) else 'MISSING_OR_INVALID'))
    info.append('BUILDER_APP_ORIGIN=' + ('VALID' if valid_origin(builder_origin) else 'MISSING_OR_INVALID'))
    if not valid_origin(web_origin) or not valid_origin(builder_origin):
        errors.append('BUILDER_ORIGINS_UNVERIFIED')
    if auth and web_origin and valid_origin(auth) and valid_origin(web_origin):
        if urlsplit(auth).netloc.lower() != urlsplit(web_origin).netloc.lower() or urlsplit(auth).scheme != urlsplit(web_origin).scheme:
            errors.append('WEB_AND_BUILDER_WEBSITE_ORIGINS_DIFFER')
    # Show check codes only: never print secret key, webhook secret, price IDs or URLs.
    return info, sorted(set(errors))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('repo', type=Path)
    parser.add_argument('--shared-env', default='.env.shared.local', help='Repo-relative candidate file (default .env.shared.local)')
    parser.add_argument('--web-env', action='append', default=[], help='Additional repo-relative web env file')
    parser.add_argument('--builder-env', action='append', default=[], help='Additional repo-relative Builder env file')
    args = parser.parse_args(argv)
    root = args.repo.resolve(strict=True)
    if not (root/'apps/web').is_dir() or not (root/'apps/zoebuild').is_dir():
        raise ValueError('Not a ZoeSkoul monorepo root')
    common = [args.shared_env]
    web = load_allowed(root, common + ['apps/web/.env', 'apps/web/.env.local'] + args.web_env)
    builder = load_allowed(root, common + ['apps/zoebuild/.env', 'apps/zoebuild/.env.local'] + args.builder_env)
    info, errors = analyze(web, builder)
    print('=== PLATFORM STRIPE SANDBOX READINESS V12F.2 (OFFLINE) ===')
    print('LOCAL_SNAPSHOT_ONLY=YES; NO_PROVIDER_ACCOUNT_VALIDATION=YES')
    print('NO_NETWORK=YES NO_DATABASE=YES NO_PAYMENTS=YES NO_WRITES=YES')
    for finding in info:
        print(finding)
    if errors:
        for code in errors:
            print('BLOCKER=' + code)
        print('LOCAL_SANDBOX_READINESS=BLOCKED')
        return 2
    print('LOCAL_SANDBOX_READINESS=CONFIG_CANDIDATE_PASS')
    print('DO_NOT_USE_LIVE_PAYMENTS: Stripe price/account/webhook delivery still require verification')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError) as error:
        # Avoid printing exceptions from provider clients or sensitive config lines.
        print('ABORT: ' + str(error), file=sys.stderr)
        sys.exit(2)
