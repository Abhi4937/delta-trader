# Deploy to Oracle Cloud Always Free (ADR 0006)

A single Always-Free ARM VM runs the whole stack (postgres + redis + backend +
frontend + Caddy) for **$0/month**. ~30–45 min end to end. You run these steps —
they need an Oracle account (KYC + a billing card for identity; Always Free is not
charged).

## 1. Create the VM
1. Sign up at https://cloud.oracle.com (choose a home region close to you).
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 22.04**.
   - Shape: **VM.Standard.A1.Flex** (Ampere ARM), **4 OCPU / 24 GB** (within Always Free).
   - Add your SSH public key.
   - Create. Note the **public IP**.
3. **Networking → VCN → Security List** (or the instance's NSG): add ingress rules
   - TCP **80** and **443** from `0.0.0.0/0`,
   - TCP your chosen **SSH port** (e.g. 2222) from your IP only.
   Remove the default 22 rule after you've moved SSH (step 4), and on the VM run
   `sudo iptables` cleanup — Oracle Ubuntu images ship a restrictive iptables;
   `sudo netfilter-persistent` rules must also allow 80/443:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 2. Prepare the host
```bash
ssh -p 2222 ubuntu@<public-ip>
# Docker Engine + the compose v2 plugin from Docker's official repo (Ubuntu's
# docker.io does NOT ship `docker compose` v2). The convenience script is simplest:
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get install -y git
sudo usermod -aG docker ubuntu && newgrp docker
# verify: docker compose version
sudo mkdir -p /opt && sudo chown ubuntu /opt
git clone https://github.com/Abhi4937/delta-trader /opt/delta-trader
cd /opt/delta-trader
cp .env.example .env
```

## 3. Configure `.env`
Edit `/opt/delta-trader/.env`:
- Keep `LIVE_TRADING_ENABLED=false` until you've done the testnet drill (`docs/RUNBOOK_LIVE.md`).
- Set a strong `API_BEARER_TOKEN=<random>` (the platform gate) and put the same value
  in the frontend build env (`VITE_API_TOKEN`) — or build the frontend image with it.
- Set `CORS_ORIGINS=https://your-domain.example`.
- Optional: `HEALTHCHECK_PING_URL=<healthchecks.io check URL>`.
- Delta keys only when you go live (testnet first).

## 4. TLS / domain (`infra/caddy/Caddyfile`)
- **Have a domain**: point an **A record** at the VM IP, then set the site line to
  `your-domain.example` and the `email` to yours. Caddy auto-provisions Let's Encrypt.
- **No domain**: use `https://<public-ip>.nip.io` (Caddy gets a cert for the nip.io
  name) or replace the site line with `:80` for plain HTTP behind the firewall.

## 5. Bring it up (prod overlay)
```bash
cd /opt/delta-trader
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build
# migrations run automatically in the backend entrypoint; to run manually:
docker compose exec backend alembic upgrade head
```

## 6. Verify
```bash
curl -s https://your-domain.example/api/health/deep   # {"status":"ok", checks all true}
```
Open `https://your-domain.example` — the three tabs load; spot chart streams.

## 7. Run at boot + backups
```bash
sudo cp infra/systemd/delta-trader.service /etc/systemd/system/
# edit WorkingDirectory to /opt/delta-trader if different
sudo systemctl daemon-reload && sudo systemctl enable --now delta-trader
# nightly backup cron — see docs/RUNBOOK_BACKUPS.md
```

## 8. Updates
```bash
cd /opt/delta-trader && git pull
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build
docker compose exec backend alembic upgrade head
```

## 9. Optional observability
```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.observability.yml up -d
# Grafana at http://<ip>:3000 (set GRAFANA_PASSWORD); Prometheus scrapes backend /metrics.
```

## Notes
- Postgres/Redis/backend/frontend host ports are **not published** in the prod
  overlay — only Caddy (80/443). DB is reachable only on the compose network.
- Persist Postgres on a separate Oracle **block volume** mounted where the
  `pgdata` Docker volume lives, so the boot disk is replaceable (see ADR 0006).
