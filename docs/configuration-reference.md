# Configuration Reference — Delivery Performance Platform

---

## Environment Variables

### Core (required)

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | HTTP listen port | `3333` |
| `HOST` | Bind address | `0.0.0.0` |
| `APP_KEY` | AdonisJS encryption key — generate once with `node ace generate:key` | `base64:...` |
| `LOG_LEVEL` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) | `info` |
| `SESSION_DRIVER` | Session storage backend | `cookie` |

### Database (required)

| Variable | Description | Default |
|---|---|---|
| `DB_HOST` | PostgreSQL host | `127.0.0.1` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL user | — |
| `DB_PASSWORD` | PostgreSQL password | — |
| `DB_DATABASE` | Database name | `delivery_productivity` |

### Authentication

| Variable | Description | Default |
|---|---|---|
| `AUTH_METHOD` | `database` or `oidc` | `database` |
| `OIDC_CLIENT_ID` | Entra ID application (client) ID | — |
| `OIDC_CLIENT_SECRET` | Entra ID client secret | — |
| `OIDC_REDIRECT_URI` | OAuth callback URL (must match Entra app config exactly) | — |
| `OIDC_TENANT_ID` | Entra tenant ID or `common` for multi-tenant | — |
| `OIDC_GROUP_CLAIM` | JWT claim name containing group IDs | `groups` |

### Integrations

| Variable | Description |
|---|---|
| `JIRA_WEBHOOK_SECRET` | HMAC-SHA256 secret for Jira webhook signature verification |
| `JIRA_BASE_URL` | Jira instance base URL (e.g. `https://your-org.atlassian.net`) |
| `JIRA_API_TOKEN` | Jira personal access token for polling APIs |
| `JIRA_EMAIL` | Email address associated with the Jira API token |
| `GITHUB_WEBHOOK_SECRET` | HMAC-SHA256 secret for GitHub webhook signature verification |
| `GITHUB_TOKEN` | GitHub personal access token for polling (optional; fallback for gap detection) |
| `HMAC_KEY` | Key used to anonymise contributor identifiers in metrics (prevents PII in DB) |

---

## Platform Settings

Platform settings are stored in the `platform_settings` table as JSONB and can be edited via **Admin → Platform Settings**. Each setting is keyed by a string identifier.

### `cross_stream_severity_thresholds`

Controls the severity level assigned to cross-stream correlation alerts.

```json
{
  "lowBlockCountThreshold": 2,
  "mediumBlockCountThreshold": 5,
  "highBlockCountThreshold": 10,
  "lowConfidenceThreshold": 60,
  "mediumConfidenceThreshold": 40
}
```

| Key | Description |
|---|---|
| `lowBlockCountThreshold` | Block count below which severity is `LOW` |
| `mediumBlockCountThreshold` | Block count above which severity is `MEDIUM` |
| `highBlockCountThreshold` | Block count above which severity is `HIGH` |
| `lowConfidenceThreshold` | Confidence % below which severity is escalated |
| `mediumConfidenceThreshold` | Confidence % below which severity is `HIGH` |

### `alert_notification_channels`

Configures where alert notifications are sent.

```json
{
  "slackWebhookUrl": "https://hooks.slack.com/services/...",
  "minimumSeverity": "MEDIUM"
}
```

| Key | Description | Values |
|---|---|---|
| `slackWebhookUrl` | Slack incoming webhook URL | any valid URL |
| `minimumSeverity` | Only send alerts at or above this level | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |

Leave `slackWebhookUrl` empty or absent to disable notifications.

### `last_alert_notification`

Managed automatically by the system — stores deduplication state for alert notifications. Do not edit manually.

---

## Scheduled Commands

The platform runs background jobs via the built-in scheduler. All commands require `startApp: true` (full application context) unless noted.

| Command | Schedule | Description |
|---|---|---|
| `scheduler:process-event-queue` | Every minute | Processes pending webhook events from the async queue |
| `scheduler:send-alert-notifications` | Every 15 minutes | Evaluates active system alerts and sends notifications |
| `scheduler:enrich-pr-delivery-streams` | Every 5 minutes | Links PRs to delivery streams via Jira ticket IDs (safety net) |
| `scheduler:materialize-cross-stream` | Hourly | Materialises cross-stream correlation data |
| `scheduler:poll-sprint-snapshots` | Every 2 hours | Fetches current sprint velocity snapshots from Jira |
| `scheduler:materialize-forecasts` | Daily | Computes and stores Monte Carlo forecast snapshots |
| `scheduler:materialize-daily-metrics` | Daily | Materialises daily DORA metric aggregates |
| `scheduler:poll-backlog` | Daily | Transitions sprint states (future → active → closed) |
| `scheduler:sync-repositories` | Daily | Syncs repository list from GitHub org |
| `scheduler:detect-github-gaps` | Daily | Detects and backfills missed GitHub PR events |
| `scheduler:enforce-data-retention` | Daily | Archives and purges events beyond the retention window |

### Running commands manually

```bash
# Process the event queue immediately
node ace scheduler:process-event-queue

# Force a backfill
node ace scheduler:materialize-daily-metrics
```

---

## Data Retention Defaults

The `EventArchiveService` and `DataRetentionService` enforce rolling retention windows. Defaults (configurable in source):

| Data type | Retention window | Archive format |
|---|---|---|
| Webhook events (raw) | 90 days | JSONL append file |
| Deployment records | 365 days | — |
| Incident events | 365 days | — |
| PR events | 365 days | — |
| Work item events | 365 days | — |
| Event queue (completed/dead-lettered) | 30 days | — |

Raw event archives are written to `storage/archive/<table>/YYYY-MM-DD.jsonl` before records are purged.

---

## Cache TTLs

The API caches metric responses in memory. TTLs per endpoint:

| Endpoint | Cache TTL |
|---|---|
| `/api/v1/metrics/realtime` | 30 seconds |
| `/api/v1/metrics/diagnostic` | 15 minutes |
| `/api/v1/metrics/trends` | 5 minutes |
| `/api/v1/metrics/forecast` | 1 hour |
| `/api/v1/metrics/pulse` | 24 hours |
| `/api/v1/metrics/cross-stream` | 5 minutes |

Cache is in-process memory and resets on restart. For a clustered deployment, consider replacing `CacheService` with a Redis-backed implementation.
