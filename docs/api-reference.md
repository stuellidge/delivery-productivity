# API Reference — Delivery Performance Platform

Base URL: `https://your-domain.com`

---

## Authentication

All `/api/v1/*` endpoints (except webhooks) require an API key passed as a Bearer token:

```
Authorization: Bearer <api-key>
```

API keys are created in **Admin → API Keys**. Keys can be scoped to specific delivery stream IDs or tech stream IDs; requests for data outside a key's scope return `403 Forbidden`.

---

## Webhooks

Webhooks do **not** require an API key. They use HMAC-SHA256 signature verification when the corresponding secret is configured.

All webhook endpoints are asynchronous — they return `202 Accepted` immediately and process the event in the background queue.

### POST /api/v1/webhooks/jira

Receives Jira events (issue created, updated, transitioned).

**Headers:**

| Header            | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `Content-Type`    | `application/json`                                              |
| `X-Hub-Signature` | `sha256=<hmac>` — required only if `JIRA_WEBHOOK_SECRET` is set |

**Response:** `202 Accepted`

```json
{ "ok": true }
```

**Supported event types:** `jira:issue_created`, `jira:issue_updated` (status transitions, resolution, assignment changes).

---

### POST /api/v1/webhooks/github

Receives GitHub events.

**Headers:**

| Header                | Description                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `Content-Type`        | `application/json`                                                    |
| `X-GitHub-Event`      | Event type (e.g. `pull_request`, `deployment_status`, `workflow_run`) |
| `X-Hub-Signature-256` | `sha256=<hmac>` — required only if `GITHUB_WEBHOOK_SECRET` is set     |

**Response:** `202 Accepted` (or `401 Unauthorized` if signature verification fails)

```json
{ "ok": true }
```

**Supported event types:** `pull_request` (opened, closed, merged), `pull_request_review`, `deployment_status`, `workflow_run`.

---

## Event Ingestion

Push deployment and incident events from your CD pipeline directly. All endpoints require API key authentication.

### POST /api/v1/events/deployment

Record a deployment event from a CI/CD pipeline.

**Request body:**

```json
{
  "repo_full_name": "acme/api-service",
  "environment": "production",
  "status": "success",
  "deployed_at": "2024-01-15T14:30:00Z",
  "commit_sha": "abc123",
  "pipeline_id": "12345",
  "trigger_type": "push",
  "pr_number": 42
}
```

| Field            | Type     | Required | Description                                                                         |
| ---------------- | -------- | -------- | ----------------------------------------------------------------------------------- |
| `repo_full_name` | string   | Yes      | `org/repo` — must match a registered repository                                     |
| `environment`    | string   | Yes      | e.g. `production`, `staging`                                                        |
| `status`         | string   | Yes      | `success`, `failed`, `rolled_back`, `cancelled`                                     |
| `deployed_at`    | ISO 8601 | Yes      | Timestamp of the deployment                                                         |
| `commit_sha`     | string   | No       | Git commit SHA                                                                      |
| `pipeline_id`    | string   | No       | CI/CD pipeline run ID                                                               |
| `trigger_type`   | string   | No       | `push`, `manual`, `schedule`, `config` (config-only deploys are excluded from DORA) |
| `pr_number`      | integer  | No       | PR number if this deployment was triggered by a PR                                  |

**Response:** `202 Accepted`

```json
{ "ok": true }
```

**Notes:**

- Deployments for repositories with `is_deployable = false` are silently ignored.
- If `pr_number` is provided and a matching `PrCycle` exists, lead time is computed automatically.

---

### POST /api/v1/events/incident

Record an incident or alarm event from your monitoring system.

**Request body:**

```json
{
  "event_type": "alarm_triggered",
  "incident_id": "INC-2024-001",
  "service_name": "api-service",
  "occurred_at": "2024-01-15T15:00:00Z",
  "severity": "P2",
  "description": "Error rate spike on /checkout endpoint"
}
```

| Field          | Type     | Required | Description                                                                 |
| -------------- | -------- | -------- | --------------------------------------------------------------------------- |
| `event_type`   | string   | Yes      | `alarm_triggered`, `incident_opened`, `alarm_resolved`, `incident_resolved` |
| `incident_id`  | string   | Yes      | Unique identifier for the incident (used to correlate open/close events)    |
| `service_name` | string   | Yes      | Must match a repository's `deploy_target` field                             |
| `occurred_at`  | ISO 8601 | Yes      | Timestamp of the event                                                      |
| `severity`     | string   | No       | e.g. `P1`, `P2`, `critical`                                                 |
| `description`  | string   | No       | Human-readable description                                                  |

**Response:** `202 Accepted`

```json
{ "ok": true }
```

**TTR calculation:** When an `alarm_resolved` or `incident_resolved` event arrives, the platform finds the matching `alarm_triggered` / `incident_opened` event and computes `time_to_restore_min` automatically.

---

## Stream Endpoints

### GET /api/v1/streams/delivery

Returns all active delivery streams.

**Query params:** none

**Response:**

```json
{
  "status": "ok",
  "data": [{ "id": 1, "name": "payments", "display_name": "Payments Team", "team_size": 8 }]
}
```

---

### GET /api/v1/streams/tech

Returns all active tech streams.

**Response:**

```json
{
  "status": "ok",
  "data": [{ "id": 1, "name": "backend", "display_name": "Backend", "github_org": "acme" }]
}
```

---

### GET /api/v1/sprints

Returns sprints for a delivery stream.

**Query params:**

| Param    | Type    | Description                                   |
| -------- | ------- | --------------------------------------------- |
| `stream` | integer | Delivery stream ID (required)                 |
| `state`  | string  | Filter by state: `future`, `active`, `closed` |

**Response:**

```json
{
  "status": "ok",
  "data": [
    {
      "id": 1,
      "name": "Sprint 42",
      "state": "active",
      "start_date": "2024-01-08",
      "end_date": "2024-01-19"
    }
  ]
}
```

---

## Metrics Endpoints

### GET /api/v1/metrics/realtime

Returns real-time WIP and cycle time data.

**Query params:**

| Param    | Type    | Description                                                    |
| -------- | ------- | -------------------------------------------------------------- |
| `stream` | integer | Delivery stream ID (optional — returns all streams if omitted) |

**Response:**

```json
{
  "status": "ok",
  "data": {
    "wip_by_stage": {
      "In Progress": 6,
      "In Review": 3,
      "Blocked": 1
    },
    "cycle_time": {
      "p50": 3.2,
      "p85": 8.1,
      "sample_size": 42
    },
    "cycle_scatter": [
      { "ticket_id": "PAY-123", "cycle_time_days": 2.5, "completed_at": "2024-01-14T10:00:00Z" }
    ]
  },
  "meta": { "stream_id": 1, "computed_at": "2024-01-15T14:00:00Z" }
}
```

**Cache TTL:** 30 seconds

---

### GET /api/v1/metrics/diagnostic

Returns flow efficiency, defect escape rate, and PR review turnaround.

**Query params:**

| Param    | Type    | Default | Description                |
| -------- | ------- | ------- | -------------------------- |
| `stream` | integer | (all)   | Delivery or tech stream ID |
| `window` | integer | `30`    | Rolling window in days     |

**Response:**

```json
{
  "status": "ok",
  "data": {
    "flow_efficiency": {
      "percentage": 38.5,
      "active_days": 2.8,
      "wait_days": 4.5
    },
    "defect_escape": {
      "rate": 4.2,
      "defect_count": 3,
      "total_completed": 71
    },
    "pr_review_turnaround": {
      "median_hours": 6.5,
      "p85_hours": 18.2,
      "reviewer_concentration": 0.62,
      "is_suppressed": false
    }
  },
  "meta": { "stream_id": 1, "window_days": 30, "computed_at": "..." }
}
```

`is_suppressed: true` means the PR review data was suppressed because fewer than the minimum number of contributors were active (default 6). This protects individual privacy.

**Cache TTL:** 15 minutes

---

### GET /api/v1/metrics/trends

Returns DORA metrics. When `tech_stream` is specified, returns a time series. Without it, returns current-window aggregates for all tech streams.

**Query params:**

| Param         | Type    | Default | Description    |
| ------------- | ------- | ------- | -------------- |
| `tech_stream` | integer | (all)   | Tech stream ID |
| `window`      | integer | `90`    | Window in days |

**Response (with tech_stream — time series):**

```json
{
  "status": "ok",
  "data": {
    "series": [
      {
        "weekStart": "2024-01-01",
        "deploymentFrequency": 12,
        "changeFailureRate": 8.3,
        "ttrMedian": 45.0,
        "leadTimeP50": 4.2,
        "leadTimeP85": 12.8
      }
    ]
  },
  "meta": { "tech_stream_id": 1, "window_days": 90, "computed_at": "..." }
}
```

**Response (without tech_stream — all streams summary):**

```json
{
  "status": "ok",
  "data": {
    "dora": [
      {
        "techStreamId": 1,
        "techStreamName": "Backend",
        "deploymentFrequency": 3.2,
        "changeFailureRate": 5.1,
        "ttrMedian": 38.0,
        "ttrMean": 52.0,
        "leadTimeP50": 5.5,
        "leadTimeP85": 14.0,
        "deployCount": 96,
        "incidentCount": 5,
        "leadTimeDeployCount": 90
      }
    ]
  },
  "meta": { "window_days": 90, "computed_at": "..." }
}
```

**Units:**

- `deploymentFrequency` — count of deploys per week (time series: raw count in bucket)
- `changeFailureRate` — percentage (0–100)
- `ttrMedian` / `ttrMean` — minutes
- `leadTimeP50` / `leadTimeP85` — hours

**Cache TTL:** 5 minutes

---

### GET /api/v1/metrics/forecast

Returns Monte Carlo sprint completion forecast.

**Query params:**

| Param    | Type    | Default | Description                                          |
| -------- | ------- | ------- | ---------------------------------------------------- |
| `stream` | integer | —       | Delivery stream ID (required for meaningful results) |
| `window` | integer | `12`    | Historical window in weeks for throughput sampling   |

**Response:**

```json
{
  "status": "ok",
  "data": {
    "forecast": {
      "p50": 14,
      "p85": 11,
      "p95": 9,
      "simulations": 1000,
      "weeks_remaining": 1.5
    }
  },
  "meta": { "stream_id": 1, "window_weeks": 12, "computed_at": "..." }
}
```

**Cache TTL:** 1 hour

---

### GET /api/v1/metrics/pulse

Returns aggregated pulse survey data.

**Query params:**

| Param     | Type    | Default | Description                               |
| --------- | ------- | ------- | ----------------------------------------- |
| `stream`  | integer | —       | Delivery stream ID                        |
| `periods` | integer | `6`     | Number of recent survey periods to return |

**Response:**

```json
{
  "status": "ok",
  "data": {
    "aggregates": [
      {
        "survey_period": "2024-01",
        "response_count": 6,
        "response_rate_pct": 75.0,
        "pace_avg": 3.8,
        "pace_trend": 0.2,
        "tooling_avg": 3.2,
        "tooling_trend": -0.1,
        "clarity_avg": 4.1,
        "clarity_trend": 0.3,
        "overall_avg": 3.7
      }
    ]
  },
  "meta": { "stream_id": 1, "periods": 6, "computed_at": "..." }
}
```

**Cache TTL:** 24 hours

---

### GET /api/v1/metrics/cross-stream

Returns cross-stream correlation and block analysis.

**Query params:**

| Param         | Type    | Description                                       |
| ------------- | ------- | ------------------------------------------------- |
| `tech_stream` | integer | If provided, returns only this tech stream's data |

**Response:**

```json
{
  "status": "ok",
  "data": {
    "correlations": [
      {
        "tech_stream_id": 1,
        "block_count_14d": 7,
        "avg_confidence_pct": 62.0,
        "avg_cycle_time_p85": 8.4,
        "severity": "MEDIUM",
        "computed_at": "2024-01-15T00:00:00Z"
      }
    ]
  },
  "meta": { "tech_stream_id": null, "computed_at": "..." }
}
```

**Cache TTL:** 5 minutes

---

## Admin Endpoints

These endpoints require an API key with unrestricted scope (or admin scope if implemented).

### GET /api/v1/admin/data-quality

Returns data quality metrics and warnings across all streams.

**Response:**

```json
{
  "status": "ok",
  "data": {
    "prLinkageRate": 84.2,
    "ticketTaggingRate": 91.5,
    "deploymentTraceability": 78.3,
    "pulseResponseRate": 62.0,
    "pulseStreamsSampled": 3,
    "warnings": [
      {
        "stream": "Backend",
        "issue": "deployment_traceability_low",
        "value": 78.3,
        "threshold": 80
      }
    ]
  }
}
```

---

### GET /api/v1/admin/integration-health

Returns the health status of each event source integration.

**Response:**

```json
{
  "status": "ok",
  "data": {
    "integrations": {
      "jira": {
        "status": "healthy",
        "lastEventAt": "2024-01-15T13:45:00Z",
        "eventCount24h": 142
      },
      "github": {
        "status": "stale",
        "lastEventAt": "2024-01-15T09:00:00Z",
        "eventCount24h": 8
      }
    }
  }
}
```

**Statuses:** `healthy` (events in last 2h), `stale` (no events in 2h but some historical data), `no_data` (never received events).

---

### GET /api/v1/admin/system-alerts

Returns currently active system alert conditions.

**Response:**

```json
{
  "status": "ok",
  "data": {
    "alerts": [
      {
        "condition": "integration_stale_github",
        "severity": "MEDIUM",
        "message": "No GitHub events received in the last 2 hours",
        "triggeredAt": "2024-01-15T09:05:00Z"
      },
      {
        "condition": "event_queue_depth_high",
        "severity": "HIGH",
        "message": "Event queue depth is 1247 (threshold: 1000)",
        "triggeredAt": "2024-01-15T14:00:00Z"
      }
    ]
  }
}
```

---

### POST /api/v1/admin/backfill/:source/:org

Triggers a historical data backfill in the background. Returns immediately.

**Path params:**

| Param    | Values                                                         |
| -------- | -------------------------------------------------------------- |
| `source` | `jira` or `github`                                             |
| `org`    | Jira project key (e.g. `PAY`) or GitHub org slug (e.g. `acme`) |

**Response:** `202 Accepted`

```json
{ "ok": true, "message": "Backfill started in background" }
```

---

## PR Link Endpoint

### POST /api/v1/pr-events/:id/link-ticket

Links an existing PR event to a Jira ticket. Used for retroactive linkage.

**Path params:**

| Param | Description           |
| ----- | --------------------- |
| `id`  | PR event ID (integer) |

**Request body:**

```json
{ "ticket_id": "PAY-456" }
```

**Response:** `200 OK`

```json
{ "ok": true }
```

---

## Error Responses

All errors follow the same envelope:

```json
{
  "status": "error",
  "message": "Descriptive error message"
}
```

| HTTP Status                 | Meaning                                                   |
| --------------------------- | --------------------------------------------------------- |
| `400 Bad Request`           | Malformed request body or missing required field          |
| `401 Unauthorized`          | Missing or invalid API key / invalid webhook signature    |
| `403 Forbidden`             | API key does not have permission for the requested stream |
| `404 Not Found`             | Resource does not exist                                   |
| `422 Unprocessable Entity`  | Validation failed — body contains field-level errors      |
| `500 Internal Server Error` | Unexpected server error — check application logs          |
