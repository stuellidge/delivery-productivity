# Operator Runbook — Delivery Performance Platform

## Overview

This document is the operator guide for the Delivery Performance Platform (DPP). It covers environment setup, deployment, maintenance, backup/recovery, and troubleshooting.

For initial installation, see the [Setup Guide](setup-guide.md).
For a full list of environment variables and platform settings, see the [Configuration Reference](configuration-reference.md).

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
| `GITHUB_TOKEN` | GitHub PAT for polling / gap detection |
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

## 5. Scheduled Commands

The platform runs background jobs via the built-in scheduler. Ensure the application process is running — the scheduler runs inside the application process (no separate cron configuration needed).

| Command | Schedule | Description |
|---|---|---|
| `scheduler:process-event-queue` | Every minute | Dequeues and processes webhook events |
| `scheduler:send-alert-notifications` | Every 15 minutes | Sends Slack alerts for active conditions |
| `scheduler:enrich-pr-delivery-streams` | Every 5 minutes | Links PRs to delivery streams via ticket IDs |
| `scheduler:materialize-cross-stream` | Hourly | Materialises cross-stream correlation data |
| `scheduler:poll-sprint-snapshots` | Every 2 hours | Fetches sprint velocity from Jira |
| `scheduler:materialize-forecasts` | Daily | Materialises Monte Carlo forecast snapshots |
| `scheduler:materialize-daily-metrics` | Daily | Materialises daily DORA metric aggregates |
| `scheduler:poll-backlog` | Daily | Transitions sprint states |
| `scheduler:sync-repositories` | Daily | Syncs repository list from GitHub |
| `scheduler:detect-github-gaps` | Daily | Detects and backfills missing PR events |
| `scheduler:enforce-data-retention` | Daily | Purges data beyond the retention window |

### Running commands manually

```bash
node ace scheduler:process-event-queue
node ace scheduler:materialize-daily-metrics
```

---

## 6. Event Queue Monitoring

The platform processes webhooks asynchronously via the `event_queue` table. Under normal operation, pending rows are consumed within 1 minute.

### Checking queue depth

```sql
SELECT status, COUNT(*) FROM event_queue GROUP BY status;
```

| Status | Description |
|---|---|
| `pending` | Awaiting processing |
| `processing` | Currently being processed (in-flight) |
| `completed` | Successfully processed |
| `dead_lettered` | Failed after 3 attempts — requires investigation |

A `HIGH` severity alert fires automatically when pending rows exceed 1,000.

### Investigating dead-lettered events

```sql
SELECT id, event_source, event_type, last_error, enqueued_at
FROM event_queue
WHERE status = 'dead_lettered'
ORDER BY enqueued_at DESC
LIMIT 20;
```

Common causes:

- Malformed payload (check `last_error` column)
- Missing repository or stream configuration
- External service unavailable during processing

To requeue a dead-lettered event:

```sql
UPDATE event_queue SET status = 'pending', attempt_count = 0 WHERE id = <id>;
```

---

## 7. Backup and Recovery

### RTO / RPO targets

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

### Event archives

Raw event archives are written to `storage/archive/<table>/YYYY-MM-DD.jsonl` before records are purged by data retention. These files can be used to replay events if a database restore is not available.

---

## 8. Data Retention

The `scheduler:enforce-data-retention` command runs daily and enforces rolling retention windows. Before purging, events are archived to JSONL files (see above).

Default retention windows:

| Table | Window |
|---|---|
| `deployment_records` | 365 days |
| `incident_events` | 365 days |
| `pr_events` | 365 days |
| `work_item_events` | 365 days |
| `event_queue` (completed/dead-lettered) | 30 days |

To adjust windows, modify the `DataRetentionService` configuration and redeploy.

---

## 9. Webhook Verification Testing

### Jira

```bash
SIG=$(echo -n '{"issue":{"key":"TEST-1"}}' | openssl dgst -sha256 -hmac "$JIRA_WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST https://your-domain.com/api/v1/webhooks/jira \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: sha256=$SIG" \
  -d '{"issue":{"key":"TEST-1"}}'
# Expected: HTTP 202
```

### GitHub

```bash
SIG=$(echo -n '{"action":"opened"}' | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST https://your-domain.com/api/v1/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -H "X-GitHub-Event: pull_request" \
  -d '{"action":"opened"}'
# Expected: HTTP 202
```

---

## 10. Alert Condition Reference

The system monitors these conditions automatically. Query `/api/v1/admin/system-alerts` with a valid API key.

| Condition | Severity | Trigger |
|---|---|---|
| `deployment_traceability_low` | LOW | Production deployments with linked ticket < 80% |
| `pulse_response_rate_low` | LOW | Current-period pulse response rate < 40% of team size |
| `integration_stale_jira` | MEDIUM | No Jira events received in last 2 hours |
| `integration_stale_github` | MEDIUM | No GitHub events received in last 2 hours |
| `event_queue_depth_high` | HIGH | Pending event queue rows >= 1,000 |

Notifications are sent via Slack if `alert_notification_channels` is configured in platform settings and the alert severity meets the `minimumSeverity` threshold.

---

## 11. Common Troubleshooting

### Application won't start

1. Check env vars: verify `APP_KEY`, `DB_*`, and `PORT` are set
2. Check database connectivity: `psql -h $DB_HOST -U $DB_USER -d $DB_DATABASE -c '\l'`
3. Check pending migrations: `node ace migration:status`

### OIDC login redirects to login page with error

1. Verify `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_TENANT_ID` are correct
2. Verify the redirect URI in Azure matches `OIDC_REDIRECT_URI` exactly
3. Check application logs for the specific OAuth error

### No data in dashboard

1. Verify webhooks are configured in Jira/GitHub to point to this instance
2. Check `/api/v1/admin/integration-health` for source status
3. Check `event_queue` table for dead-lettered events (see section 6)
4. Check application logs for processing errors

### Metrics API returns 401

1. Ensure the `Authorization: Bearer <key>` header contains the raw API key
2. Verify the key is active (not revoked) in Admin → API Keys

### Metrics API returns 403

The API key has a stream scope restriction. Either use an unrestricted key or check that the `?stream=` or `?tech_stream=` parameter matches one of the key's allowed stream IDs.

### Event queue growing continuously

1. Check application logs for recurring errors in the queue processor
2. Query `event_queue` for `dead_lettered` rows and inspect `last_error`
3. Verify Jira/GitHub credentials and external connectivity
4. If the queue is backed up due to downtime, it will drain automatically once processing resumes

---

## 12. Health Check Endpoint

```bash
curl https://your-domain.com/api/v1/admin/integration-health \
  -H "Authorization: Bearer your-api-key"
```

A healthy response has `status: "ok"` and all sources showing `"healthy"` or `"no_data"`.
