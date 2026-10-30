---
name: deployment
description: Deploy flow — health check verification, rollback, post-deploy validation
---

## Goal

Execute safe, auditable deployments with automatic health checks, rollback capability, and post-deployment validation.

## Procedure

### 1. Pre-deploy verification

```bash
# Check branch is correct
git branch --show-current

# Check commits to deploy
git log origin/release..HEAD --oneline

# Run tests
yarn test

# Build
yarn build
```

### 2. Deploy execution

**API:**
```bash
git checkout release && git pull
yarn install --production
yarn run-migrate
pm2 restart meu-projeto-api
```

**APP:**
```bash
git checkout release && git pull
yarn install
yarn build
pm2 restart meu-projeto-app
```

### 3. Health check validation

Check these immediately after deploy:
```bash
# API health
curl -f http://localhost:3001/health

# Check error rate
pm2 monit

# Check logs for startup errors
pm2 logs meu-projeto-api --lines 20
```

### 4. Rollback procedure

If health check fails:

```bash
# API rollback
git checkout v2.4.9  # previous tag
yarn install --production
yarn run-migrate:rollback
pm2 restart meu-projeto-api
```

**Criteria for rollback:**
- 5xx errors > 1% of requests
- Health check endpoint returning non-200
- Critical business flow broken
- Migration failed

### 5. Post-deploy validation

- [ ] API health check: `GET /health` → 200
- [ ] Database migrations: `yarn run-migrate:status`
- [ ] Critical user flow (login + core feature)
- [ ] Error monitoring (Sentry/Prometheus)
- [ ] Performance check (response times)

## Output

```json
{
  "tipo": "deploy_report",
  "ambiente": "release",
  "versao": "v2.5.0",
  "status": "success | failed | rolled_back",
  "health_checks": {
    "api": "✅ 200 OK (120ms)",
    "migration": "✅ up-to-date",
    "worker": "✅ running"
  },
  "duracao": "4min 23s",
  "rollback_executado": false,
  "comandos_executados": ["git checkout release", "yarn install", "pm2 restart"]
}
```

## Guardrails
- Never deploy on Friday afternoon
- Always test rollback procedure before production
- One change at a time — never batch unrelated deploys
- Monitor for 15min after deploy before leaving
