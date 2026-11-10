#!/usr/bin/env python3
"""Operator-only DEV grant; reads secret from environment, never CLI or browser.
Requires ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET in the local operator shell.
Does not start a session or communicate with the Runner.
"""
import base64, hashlib, hmac, json, os, secrets, sys, time
if len(sys.argv) != 3 or sys.argv[2] not in {"sudo-root-concepts","ownership-administration-concepts","final-capstone-secure-project"}:
    raise SystemExit("usage: mint-operator-grant.py <actor-key> <approved-topic-slug>")
secret=os.environ.get("ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET","")
if len(secret.encode())<32:
    raise SystemExit("ERROR: trusted operator signing secret missing")
now=int(time.time())
claims={"v":1,"aud":"zoeskoul-learning-admin","actorKey":sys.argv[1],"courseSlug":"linux-files-permissions-users","topicSlug":sys.argv[2],"iat":now,"exp":now+45,"nonce":secrets.token_hex(16)}
encoded=base64.urlsafe_b64encode(json.dumps(claims,separators=(',',':')).encode()).rstrip(b'=').decode()
sig=base64.urlsafe_b64encode(hmac.new(secret.encode(),encoded.encode(),hashlib.sha256).digest()).rstrip(b'=').decode()
print(encoded+'.'+sig)
