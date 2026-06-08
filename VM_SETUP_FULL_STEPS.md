# Full VM setup steps

## 1. Hetzner

Create a private network:

```text
Network: zoeskoul-private
Range: 10.10.0.0/16
Subnet: 10.10.0.0/24
VM 1 private IP: 10.10.0.2
VM 2 private IP: 10.10.0.3
```

Create two Ubuntu servers in the same location/network:

```text
VM 1: zoeskoul-web-1
VM 2: zoeskoul-runner-1
```

Firewall VM 1:

```text
22 from your home IP
80 from all
443 from all
```

Firewall VM 2:

```text
22 from your home IP
4001 from 10.10.0.2 only
```

Do not expose VM 2 ports 4001, 2358, 5432, or 6379 publicly.

## 2. DNS

```text
zoeskoul.com          A -> VM 1 public IP
www.zoeskoul.com      A -> VM 1 public IP
runner.zoeskoul.com   A -> VM 1 public IP
```

## 3. Build images

Use GitHub Actions included in this bundle, or manually from your Mac:

```bash
export GHCR_OWNER=your-github-user-or-org-lowercase
export IMAGE_TAG=$(git rev-parse --short=12 HEAD)

docker buildx build --platform linux/amd64 \
  -t ghcr.io/$GHCR_OWNER/zoeskoul-web:$IMAGE_TAG \
  -t ghcr.io/$GHCR_OWNER/zoeskoul-web:prod \
  -f apps/web/Dockerfile --push .

docker buildx build --platform linux/amd64 \
  -t ghcr.io/$GHCR_OWNER/zoeskoul-runner:$IMAGE_TAG \
  -t ghcr.io/$GHCR_OWNER/zoeskoul-runner:prod \
  -f apps/runner/Dockerfile --push .
```

## 4. VM 2 first

```bash
sudo mkdir -p /opt/zoeskoul
sudo chown -R deploy:deploy /opt/zoeskoul
cd /opt/zoeskoul

git clone --filter=blob:none --sparse git@github.com:YOUR_USER_OR_ORG/zoeskoul.com.git .
git sparse-checkout set infra/hosts/runner infra/scripts infra/firewall

./infra/scripts/install-docker.sh
# log out and back in
./infra/scripts/install-rootless-docker.sh

cd infra/hosts/runner
cp .env.example .env
nano .env

docker login ghcr.io
./deploy.sh
./smoke-test.sh
```

If Judge0 fails because of cgroups, configure the host for cgroup v1 and reboot. Keep this as an explicit maintenance action, not an automatic script.

## 5. VM 1 second

```bash
sudo mkdir -p /opt/zoeskoul
sudo chown -R deploy:deploy /opt/zoeskoul
cd /opt/zoeskoul

git clone --filter=blob:none --sparse git@github.com:YOUR_USER_OR_ORG/zoeskoul.com.git .
git sparse-checkout set infra/hosts/web infra/scripts infra/firewall

./infra/scripts/install-docker.sh
# log out and back in

cd infra/hosts/web
cp .env.example .env
nano .env

docker login ghcr.io
./deploy.sh
./smoke-test.sh
```

## 6. Migrations

On VM 1:

```bash
cd /opt/zoeskoul/infra/hosts/web
./migrate.sh
```

If your migration command is different, set `MIGRATE_COMMAND` in `.env`.

## 7. Backup

On VM 1:

```bash
cd /opt/zoeskoul/infra/hosts/web
./backup-postgres.sh
```

Before public prod, test restore on staging:

```bash
./restore-postgres.sh /opt/zoeskoul-backups/postgres/backup.sql.gz
```

## 8. Final production checks

```bash
# VM 1 can reach runner private health
curl http://10.10.0.3:4001/healthz

# laptop can reach public domains
curl -I https://zoeskoul.com
curl -I https://runner.zoeskoul.com/healthz

# laptop cannot reach VM 2 runner/Judge0 directly
curl http://VM2_PUBLIC_IP:4001/healthz
curl http://VM2_PUBLIC_IP:2358/languages

# no websocket token leakage in Caddy logs
cd /opt/zoeskoul/infra/hosts/web
docker compose logs caddy | grep 'token='
```

The token grep should return nothing.
