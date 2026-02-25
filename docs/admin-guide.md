# Admin Guide — Delivery Performance Platform

This guide covers the platform administration console, available at `/admin`. All admin pages require the `platform_admin` role.

---

## Table of Contents

1. [Delivery Streams](#1-delivery-streams)
2. [Tech Streams](#2-tech-streams)
3. [Status Mappings](#3-status-mappings)
4. [API Keys](#4-api-keys)
5. [User Management](#5-user-management)
6. [Platform Settings](#6-platform-settings)
7. [OIDC Group Mappings](#7-oidc-group-mappings)
8. [Public Holidays](#8-public-holidays)
9. [Session Management](#9-session-management)
10. [Audit Log](#10-audit-log)
11. [Integration Health](#11-integration-health)
12. [Unlinked PRs](#12-unlinked-prs)
13. [Backfill Procedures](#13-backfill-procedures)

---

## 1. Delivery Streams

**Path:** `/admin/streams/delivery`

A **Delivery Stream** represents a team or squad delivering software — typically aligned to a product area (e.g. "Payments", "Search"). Delivery streams own:

- Work items (Jira issues)
- Pulse survey responses
- Sprint forecasts

### Creating a delivery stream

1. Navigate to **Admin → Delivery Streams → New**.
2. Fill in:

| Field | Description |
|---|---|
| **Name** | Unique slug, lowercase, no spaces (e.g. `payments`) |
| **Display Name** | Human-readable label shown in the UI |
| **Team Size** | Current headcount — used to calculate pulse response rates |

3. Save.

### Associating Jira issues

Issues are associated with a delivery stream via **Status Mappings** (see section 3). The platform reads the Jira project and issue type, and assigns incoming tickets to the matching delivery stream.

---

## 2. Tech Streams

**Path:** `/admin/streams/tech`

A **Tech Stream** represents a GitHub organisation or subset of repositories — typically aligned to a platform or product codebase. Tech streams own:

- Repositories
- Deployments
- Incidents
- DORA metrics

### Creating a tech stream

| Field | Description |
|---|---|
| **Name** | Unique slug |
| **Display Name** | Human-readable label |
| **GitHub Org** | The GitHub organisation slug (e.g. `acme`) — must be unique |
| **GitHub Install ID** | GitHub App installation ID (if using GitHub Apps for auth) |
| **Min Contributors** | Minimum distinct contributors required before PR review concentration is shown (default: 6) — protects individual privacy |
| **Ticket Regex** | Optional custom regex for extracting ticket IDs from PR titles/bodies (e.g. `([A-Z]+-\d+)`) |
| **Active** | Inactive streams are excluded from all metrics |

### Registering repositories

Repositories are synced automatically via the daily `scheduler:sync-repositories` command. You can also trigger a sync manually:

```bash
node ace scheduler:sync-repositories
```

After sync, navigate to the repository list and mark repositories as **deployable** if they produce production deployments. Non-deployable repositories (e.g. infrastructure-only, documentation) are excluded from DORA metrics.

---

## 3. Status Mappings

**Path:** `/admin/status-mappings`

Status mappings tell the platform how to translate Jira workflow statuses into the platform's standardised stages.

### Standardised stages

| Stage | Meaning |
|---|---|
| `backlog` | Not yet started |
| `in_progress` | Actively being worked on |
| `in_review` | In code review / stakeholder review |
| `blocked` | Waiting on an external dependency |
| `done` | Completed and closed |

### Creating a mapping

1. Navigate to **Admin → Status Mappings → New**.
2. Fill in:

| Field | Description |
|---|---|
| **Jira Project** | Jira project key (e.g. `PAY`) |
| **Jira Status** | Exact status name from Jira (case-sensitive) |
| **Delivery Stream** | Which delivery stream this project belongs to |
| **Platform Stage** | One of the standardised stages above |

**Example mappings for a typical Jira project:**

| Jira Status | Platform Stage |
|---|---|
| `To Do` | `backlog` |
| `In Progress` | `in_progress` |
| `In Review` | `in_review` |
| `Blocked` | `blocked` |
| `Done` | `done` |
| `Closed` | `done` |

### Diagnosing missing data

If work items are not appearing in the dashboard, check:

1. The Jira project has a delivery stream mapped.
2. All Jira statuses used in that project have a corresponding mapping.
3. The **Ticket Tagging Rate** in `/api/v1/admin/data-quality` — values below 90% indicate unmapped statuses.

---

## 4. API Keys

**Path:** `/admin/api-keys`

API keys are used to authenticate calls to `/api/v1/*` endpoints from CI/CD pipelines, monitoring tools, or external dashboards.

### Creating a key

1. Navigate to **Admin → API Keys → New**.
2. Fill in:

| Field | Description |
|---|---|
| **Name** | Descriptive label (e.g. `Grafana Dashboard`, `CD Pipeline`) |
| **Stream Scope** | Optional — restrict the key to specific delivery or tech stream IDs |

3. Save. The raw key is shown **once** — copy it immediately. It is stored as a hash.

### Authentication

Pass the key in the `Authorization` header:

```
Authorization: Bearer dpp_live_xxxxxxxxxxxxx
```

### Stream scoping

If a key has a stream scope, any request for a stream outside that scope returns `403 Forbidden`. Use scoping to:

- Give a team's dashboard access only to their own stream data.
- Prevent a CI pipeline from reading another team's metrics.

### Revoking a key

Click **Revoke** next to the key. The key is deactivated immediately. Revoked keys cannot be re-enabled — create a new key instead.

---

## 5. User Management

**Path:** `/admin/users`

### Roles

| Role | Description |
|---|---|
| `platform_admin` | Full access to admin console, all streams, all settings |
| `viewer` | Read-only access to the dashboard and cross-stream view |

Users without any role can log in but cannot access the dashboard.

### Activating / deactivating users

Deactivated users cannot log in. Their session tokens are not automatically revoked — use **Admin → Sessions** to force revoke active sessions for a deactivated user.

### Adding / removing roles

Navigate to **Admin → Users → [User]** and use the role management section. A user can hold multiple roles.

---

## 6. Platform Settings

**Path:** `/admin/platform-settings`

Platform settings are JSONB configuration values stored in the database. They can be edited without a deployment.

See the [Configuration Reference](configuration-reference.md) for the full list of keys and their JSON schemas.

**Important:** The editor does not validate JSON structure — invalid JSON will be saved but may cause runtime errors. Test changes in a non-production environment first.

---

## 7. OIDC Group Mappings

**Path:** `/admin/oidc-group-mappings`

When `AUTH_METHOD=oidc` is configured, users logging in via Entra ID are automatically assigned roles based on their group membership.

### Creating a mapping

| Field | Description |
|---|---|
| **Group Object ID** | The Entra ID group's object ID (GUID format) |
| **Role** | The platform role to assign: `platform_admin` or `viewer` |
| **Delivery Stream** | Optional — link this group to a specific delivery stream |
| **Tech Stream** | Optional — link this group to a specific tech stream |

Groups not listed in any mapping result in users with no role assigned on first login.

### First admin setup

If OIDC is enabled and no admin users exist yet, use the database fallback:

1. Temporarily set `AUTH_METHOD=database` (or add a database user as described in the [Setup Guide](setup-guide.md)).
2. Log in as the database admin user.
3. Configure OIDC group mappings.
4. Switch back to `AUTH_METHOD=oidc`.

---

## 8. Public Holidays

**Path:** `/admin/public-holidays`

Public holidays are excluded from business day calculations used in:

- Cycle time (active/wait time analysis)
- Sprint business day counts

### Adding a holiday

| Field | Description |
|---|---|
| **Date** | Date in `YYYY-MM-DD` format |
| **Name** | Descriptive label (e.g. `Christmas Day`) |
| **Country** | Optional ISO country code (e.g. `GB`) |

Add holidays for the countries and regions your teams operate in. Holidays apply globally — if your teams span multiple countries with different holiday calendars, add all relevant dates.

---

## 9. Session Management

**Path:** `/admin/sessions`

Lists all active authenticated sessions for platform users. Each session shows:

- Username
- Login time
- Last seen
- IP address and user agent

### Revoking a session

Click **Revoke** to immediately invalidate a user's session token. The user will be redirected to the login page on their next request.

Use this to force log out a user whose account has been compromised, or after deactivating a user account.

---

## 10. Audit Log

**Path:** `/admin/audit-log`

The audit log records significant admin actions:

- User role changes
- API key creation and revocation
- Platform setting changes
- User activation/deactivation
- Backfill jobs triggered

Entries are stored in the `audit_log` table and are not deletable from the UI. They can be queried directly from the database for compliance purposes.

---

## 11. Integration Health

**Path:** `/admin/integration-health`

Shows the current status of each event source:

| Column | Description |
|---|---|
| **Source** | `jira`, `github`, `deployment`, `incident` |
| **Status** | `healthy`, `stale`, or `no_data` |
| **Last Event** | Timestamp of the most recently received event |
| **Events (24h)** | Count of events received in the last 24 hours |

**Stale** means no events received in the last 2 hours. This typically indicates a misconfigured webhook or a network connectivity issue.

### Checking event queue depth

The event queue (async processor) depth is monitored automatically. If the queue exceeds 1,000 pending rows, a `HIGH` severity alert is raised. Check `/api/v1/admin/system-alerts` or the Slack notification channel.

To check queue depth manually:

```sql
SELECT status, COUNT(*) FROM event_queue GROUP BY status;
```

---

## 12. Unlinked PRs

**Path:** `/admin/data-quality/unlinked-prs`

Lists pull requests that could not be automatically linked to a Jira ticket. This happens when:

- The PR title or description does not contain a recognised ticket ID pattern.
- The ticket ID does not exist in the platform's issue database.

### Linking a PR manually

1. Find the unlinked PR in the list.
2. Enter the Jira ticket ID in the **Link Ticket** field.
3. Click **Link**.

This retroactively links the PR, updates the PR's delivery stream assignment, and improves lead time calculations.

### Improving automatic linkage

- Ask engineers to include the ticket ID in the PR title (e.g. `PAY-456 Fix checkout timeout`).
- If your project uses a non-standard ticket format, configure a **Ticket Regex** on the Tech Stream.
- Monitor **PR Linkage Rate** in `/api/v1/admin/data-quality` — target > 80%.

---

## 13. Backfill Procedures

Use backfill when:

- The platform was installed after teams were already active.
- Webhook events were missed due to downtime or misconfiguration.
- A new delivery stream or tech stream is added and historical data needs importing.

### Jira backfill

```bash
# Backfill all issues for a Jira project
POST /api/v1/admin/backfill/jira/PAY

# Or via curl
curl -X POST https://your-domain.com/api/v1/admin/backfill/jira/PAY \
  -H "Authorization: Bearer your-api-key"
```

Requires `JIRA_BASE_URL`, `JIRA_API_TOKEN`, and `JIRA_EMAIL` to be configured. The backfill runs asynchronously and paginates through all issues in the project.

### GitHub backfill

```bash
POST /api/v1/admin/backfill/github/acme
```

Requires `GITHUB_TOKEN` to be configured. Backfills closed and merged PRs from all repositories in the GitHub organisation.

### Monitoring backfill progress

Backfills run in the background. Monitor progress via:

```bash
# Application logs
pm2 logs dpp

# Or if running interactively
node ace serve --hmr
```

Look for log lines containing `[JiraBackfillService]` or `[GitHubBackfillService]`.

### Re-triggering after downtime

If webhooks were missed (e.g. after a server restart), the daily `scheduler:detect-github-gaps` command automatically detects and backfills missing GitHub PR events from the last 7 days. For longer gaps, run a manual backfill.

Jira gaps must be backfilled manually — Jira does not support webhook replay.
