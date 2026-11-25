#!/usr/bin/env python3
"""Image-owned Linux fs-verity helper; never execute dependency code.

The caller owns the private staging/store namespace and serializes publication.
This is a content attestation, not a defense against a compromised Runner UID.
"""
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import struct
import sys
import tempfile

MAX_BYTES = 640 * 1024 * 1024
MAX_FILES = 60_000
ENABLE = 0x40806685
MEASURE = 0xC0046686
ARGS = struct.pack('=IIIIQIIQ11Q', 1, 1, 4096, 0, 0, 0, 0, 0, *([0]*11))
UNSUPPORTED = {errno.EOPNOTSUPP, errno.ENOTTY, errno.ENOSYS}
FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK

class Invalid(Exception):
    pass

def require(condition):
    if not condition:
        raise Invalid()

def signature(s):
    return (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid,
            s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)

def frame(h, *parts):
    for part in parts:
        if not isinstance(part, bytes):
            part = os.fsencode(str(part))
        h.update(struct.pack('>Q', len(part)))
        h.update(part)

def measure(fd):
    data = bytearray(68)
    struct.pack_into('=HH', data, 0, 0, 64)
    fcntl.ioctl(fd, MEASURE, data, True)
    require(struct.unpack_from('=HH', data) == (1, 32))
    return bytes(data[4:36])

def enable(fd):
    fcntl.ioctl(fd, ENABLE, ARGS)

def supported(parent):
    # Only the disposable capability probe may report unsupported. Once
    # sealing starts, every failure rejects publication, including ENOTSUP.
    fd, name = tempfile.mkstemp(prefix='.verity-probe-', dir=parent)
    try:
        try:
            os.write(fd, b'zoebuild-verity-probe-v1')
        finally:
            os.close(fd)
        fd = os.open(name, FLAGS)
        try:
            try:
                enable(fd)
            except OSError as exc:
                if exc.errno in UNSUPPORTED:
                    return False
                raise
            measure(fd)
            return True
        finally:
            os.close(fd)
    finally:
        os.unlink(name)

def scan(root, key, seal=False):
    root = Path(root)
    initial = root.lstat()
    require(stat.S_ISDIR(initial.st_mode) and initial.st_uid == os.geteuid())
    canonical = root.resolve(strict=True)
    require(canonical == root)
    digest = hashlib.sha256()
    frame(digest, 'zoebuild-preview-dependency-verity-tree-v1', key, initial.st_mode & 0o7777)
    count = total = 0
    def walk(directory, relative, before):
        nonlocal count, total
        dirfd = os.open(directory, FLAGS | os.O_DIRECTORY)
        try:
            require(signature(os.fstat(dirfd)) == signature(before))
            with os.scandir(dirfd) as entries:
                names = []
                for entry in entries:
                    require(len(names) + count < MAX_FILES)
                    names.append(entry.name)
            for name in sorted(names, key=os.fsencode):
                count += 1
                require(count <= MAX_FILES)
                rel = relative / name
                p = directory / name
                s = os.stat(name, dir_fd=dirfd, follow_symlinks=False)
                require(s.st_dev == initial.st_dev and s.st_uid == os.geteuid())
                mode = s.st_mode & 0o7777
                if stat.S_ISLNK(s.st_mode):
                    target = os.readlink(name, dir_fd=dirfd)
                    require(not os.path.isabs(target))
                    require(p.resolve(strict=True).is_relative_to(canonical))
                    frame(digest, 'L', rel, target)
                elif stat.S_ISDIR(s.st_mode):
                    frame(digest, 'D', rel, mode)
                    walk(p, rel, s)
                elif stat.S_ISREG(s.st_mode):
                    require(s.st_nlink == 1 and 0 <= s.st_size <= MAX_BYTES - total)
                    total += s.st_size
                    frame(digest, 'F', rel, mode, s.st_size)
                    fd = os.open(name, FLAGS, dir_fd=dirfd)
                    try:
                        require(signature(os.fstat(fd)) == signature(s))
                        if seal:
                            enable(fd)
                            after = os.fstat(fd)
                            # Verity activation changes ctime, not file identity/content.
                            require(signature(s)[:-1] == signature(after)[:-1])
                            s = after
                        frame(digest, measure(fd))
                        require(signature(os.fstat(fd)) == signature(s))
                    finally:
                        os.close(fd)
                else:
                    raise Invalid()
                require(signature(os.stat(name, dir_fd=dirfd, follow_symlinks=False)) == signature(s))
            require(signature(os.fstat(dirfd)) == signature(before))
            require(signature(directory.lstat()) == signature(before))
        finally:
            os.close(dirfd)
    walk(root, Path(), initial)
    return {'digest': digest.hexdigest(), 'bytes': total, 'files': count}

def main():
    if len(sys.argv) != 4 or sys.platform != 'linux' or os.uname().machine not in ('x86_64', 'aarch64'):
        raise Invalid()
    mode, name, key = sys.argv[1:]
    root = Path(name)
    require(root.is_absolute() and root.name == 'node_modules' and re.fullmatch(r'[a-f0-9]{64}', key))
    require(mode in ('seal', 'verify'))
    require(root.parent.parent.name == '.zoebuild-preview-dependency-layers-v1')
    require(root.parent.parent.resolve(strict=True) == root.parent.parent)
    require(root.lstat().st_dev == root.parent.lstat().st_dev)
    if mode == 'seal':
        require(re.fullmatch(r'\.pending-[0-9a-f-]{36}', root.parent.name))
        if not supported(root.parent):
            return {'status': 'unsupported'}
        sealed = scan(root, key, seal=True)
        require(scan(root, key) == sealed)
        return {'status': 'ok', 'tree': sealed}
    require(root.parent.name == key)
    return {'status': 'ok', 'tree': scan(root, key)}

if __name__ == '__main__':
    try:
        print(json.dumps(main(), separators=(',', ':')))
    except (OSError, Invalid, ValueError, RuntimeError, OverflowError):
        # Never emit private paths, filenames or dependency contents.
        print('{"status":"invalid"}')
        sys.exit(1)
