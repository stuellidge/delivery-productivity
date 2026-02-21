# Operator Runbook — Delivery Performance Platform

## Overview

This document is the operator guide for the Delivery Performance Platform (DPP). It covers environment setup, deployment, maintenance, backup/recovery, and troubleshooting.

---

## 1. Environment Variables

### Required

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | HTTP port | `3333` |
| `APP_KEY` | AdonisJS encryption key (generate once, keep secret) | `base64:...` |
| `HOST` | Bind host | `0.0.0.0` |
| `LOG_LEVEL` | Pino log level | `info` |
| `SESSION_DRIVER` | Session storage | `cookie` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL user | `dpp` |
| `DB_PASSWORD` | PostgreSQL password | _(secret)_ |
| `DB_DATABASE` | Database name | `delivery_productivity` |

### Optional — Integrations

| Variable | Description |
|---|---|
| `JIRA_WEBHOOK_SECRET` | Shared secret for Jira webhook HMAC verification |
| `JIRA_BASE_URL` | Jira base URL (e.g. `https://your-org.atlassian.net`) |
| `JIRA_API_TOKEN` | Jira API token for polling (if used) |
| `JIRA_EMAIL` | Jira account email for API auth |
| `GITHUB_WEBHOOK_SECRET` | Shared secret for GitHub webhook HMAC verification |
| `HMAC_KEY` | Key for anonymising identifiers in metrics |

### Optional — Authentication

| Variable | Description | Default |
|---|---|---|
| `AUTH_METHOD` | `database` or `oidc` | `database` |
| `OIDC_CLIENT_ID` | Entra ID application (client) ID | — |
| `OIDC_CLIENT_SECRET` | Entra ID client secret | — |
| `OIDC_REDIRECT_URI` | OAuth callback URL (must match Entra app config) | — |
| `OIDC_TENANT_ID` | Entra tenant ID or `common` | — |
| `OIDC_GROUP_CLAIM` | JWT claim containing group IDs | `groups` |

---

## 2. OIDC Configuration (Microsoft Entra ID)

### Register the App in Azure

1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**
2. Name: `Delivery Performance Platform`
3. Redirect URI: `https://your-domain.com/auth/social/callback`
4. Under **Certificates & secrets**, create a client secret. Copy it immediately.
5. Under **Token configuration**, add a **Groups claim**: select `Security groups`.
6. Under **API permissions**, add `User.Read` (delegated).

### Set environment variables

```bash
AUTH_METHOD=oidc
OIDC_TENANT_ID=<your-tenant-id>
OIDC_CLIENT_ID=<your-application-client-id>
OIDC_CLIENT_SECRET=<your-client-secret>
OIDC_REDIRECT_URI=https://your-domain.com/auth/social/callback
OIDC_GROUP_CLAIM=groups
```

### Map Entra groups to platform roles

Log in as an existing `platform_admin` user (or use the database auth fallback), navigate to **Admin → OIDC Mappings**, and create mappings from Entra group object IDs to platform roles.

Example: group `a1b2c3d4-...` maps to `platform_admin`.

---

## 3. Database Migrations

```bash
# Run all pending migrations
node ace migration:run

# Check migration status
node ace migration:status

# Rollback the last batch
node ace migration:rollback

# Wipe and re-run all (development only — DESTRUCTIVE)
node ace migration:fresh
```

---

## 4. Starting / Stopping the Service

### Development

```bash
node ace serve --hmr
```

### Production

```bash
npm run build
npm start
```

### With process manager (pm2)

```bash
pm2 start npm --name dpp -- start
pm2 logs dpp
pm2 restart dpp
pm2 stop dpp
```

---

## 5. Backup and Recovery

### RTO / RPO targets (§8.6)

- **RPO**: 1 hour (hourly database backups)
- **RTO**: 4 hours (restore from backup + restart service)

### Database backup

```bash
# Full backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_DATABASE -F c -f backup-$(date +%Y%m%d-%H%M).dump

# Restore
pg_restore -h $DB_HOST -U $DB_USER -d $DB_DATABASE -F c backup.dump
```

Configure a cron job or cloud-native snapshot (e.g. AWS RDS automated backups) to run hourly.

### Application state

DPP is stateless — all data is in PostgreSQL. After restoring the database, restart the application. No additional state migration is needed.

---

## 6. Webhook Verification Testing

### Jira

```bash
# Compute HMAC-SHA256 signature of the payload
SIG=$(echo -n '{"issue":{"key":"TEST-1"}}' | openssl dgst -sha256 -hmac "$JIRA_WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST https://your-domain.com/api/v1/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: sha256=$SIG" \
  -d '{"issue":{"key":"TEST-1"}}'
```

### GitHub

```bash
SIG=$(echo -n '{"action":"opened"}' | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST https://your-domain.com/api/v1/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -H "X-GitHub-Event: pull_request" \
  -d '{"action":"opened"}'
```

---

## 7. Alert Condition Reference (§8.5)

The system monitors these conditions automatically. Query `/api/v1/admin/system-alerts` with a valid API key.

| Condition | Severity | Trigger |
|---|---|---|
| `deployment_traceability_low` | LOW | Production deployments with linked ticket < 80% |
| `pulse_response_rate_low` | LOW | Current-period pulse response rate < 40% of team size |
| `integration_stale_jira` | MEDIUM | No Jira events received in last 2 hours |
| `integration_stale_github` | MEDIUM | No GitHub events received in last 2 hours |

---

## 8. Common Troubleshooting

### Application won't start

1. Check env vars: `node ace env:check` (if available)
2. Check database connectivity: `psql -h $DB_HOST -U $DB_USER -d $DB_DATABASE -c '\l'`
3. Check pending migrations: `node ace migration:status`

### OIDC login redirects to login page with error

1. Verify `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_TENANT_ID` are correct
2. Verify the redirect URI in Azure matches `OIDC_REDIRECT_URI` exactly
3. Check application logs for the specific OAuth error

### No data in dashboard

1. Verify webhooks are configured in Jira/GitHub to point to this instance
2. Check `/api/v1/admin/integration-health` for source status
3. Check application logs for webhook ingestion errors

### Metrics API returns 401

1. Ensure the `x-api-key` header contains the raw API key (not the hash)
2. Verify the key is active (not revoked) in Admin → API Keys

---

## 9. Health Check Endpoint

```bash
curl https://your-domain.com/api/v1/admin/integration-health \
  -H "x-api-key: your-api-key"
```

A healthy response has `status: "ok"` and all sources showing `"healthy"` or `"no_data"`.
