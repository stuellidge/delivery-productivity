# Delivery Performance Platform — Technical Specification

**Document Status:** Draft v1.0
**Author:** Technical Product Owner
**Last Updated:** 2026-02-18
**Classification:** Internal — Engineering

---

## 1. Executive Summary

### 1.1 Purpose

This document specifies the design and requirements for the Delivery Performance Platform (DPP), an internal system that provides real-time, historical, and forecast views of software delivery performance across multiple delivery streams and technology streams.

The platform integrates data from Jira (work management), GitHub (source control and CI/CD), and cloud deployment infrastructure to compute metrics aligned with the DORA, SPACE, and OKR frameworks. Its primary purpose is to drive behavioural improvements in delivery teams by making flow, quality, and predictability visible — not to measure individual performance.

### 1.2 Scope

The platform covers the full delivery pipeline from business analysis through development, quality assurance, and user acceptance testing to production deployment (BA → DEV → QA → UAT → PROD). It serves delivery teams, engineering leadership, and programme-level stakeholders.

### 1.3 Design Principles

| Principle | Rationale |
|---|---|
| Behaviour-first metrics | Every metric exists to answer a question and provoke a specific action. If a metric doesn't change a decision, it is excluded. |
| Technology agnostic | The specification describes data flows, schemas, and computations without prescribing specific implementation technologies beyond the requirement for a relational database. |
| Event-sourced | Raw events are stored immutably. Computed metrics are derived views that can be recomputed from the event log at any time. |
| Stream-aware | All data is tagged with delivery stream and technology stream at the point of collection, enabling per-stream and cross-stream analysis. |
| Privacy by design | The platform measures process, not people. Individual activity data is used only in aggregate. Pulse survey responses are anonymous. |

### 1.4 Key Terminology

| Term | Definition |
|---|---|
| Delivery Stream | A value stream aligned to a product area or business outcome (e.g. "Payments", "Onboarding"). A delivery stream may span multiple technology streams. |
| Technology Stream | A technical domain represented by a GitHub organisation (e.g. "Core API", "Auth Service"). Maps 1:1 to a GitHub org. |
| Work Item | A Jira ticket representing a unit of deliverable work (story, task, or bug) that passes through the pipeline stages. |
| Pipeline Stage | One of the defined workflow stages: BA, DEV, QA, UAT, DONE. Mapped from Jira statuses. |
| Event | An immutable record of something that happened in one of the source systems, captured with a timestamp, source identifiers, and stream tags. |
| Computed Metric | A derived value calculated from one or more event types, refreshed on a defined schedule. |

---

## 2. Organisational Context

### 2.1 Multi-Organisation GitHub Structure

The company organises its source code across multiple GitHub organisations, each representing a distinct technology stream. All repositories within these organisations are private.

| GitHub Organisation (example) | Technology Stream | Description |
|---|---|---|
| {company}-core-api | core-api | Backend services, API gateway, domain logic |
| {company}-auth | auth | Identity, authentication, SSO, token services |
| {company}-data | data-layer | Data warehouse, ETL, reporting APIs, event store |
| {company}-frontend | frontend | Customer-facing UIs, admin dashboards, component libraries |
| {company}-infra | infra | Infrastructure-as-code, CI templates, monitoring |

This mapping is configuration-driven. Adding a new technology stream requires adding a new row to the configuration, not a code change. See §5.2 for the configuration schema.

### 2.2 Delivery Streams

Delivery streams are defined in Jira and represent cross-cutting value streams. A single delivery stream may involve work across multiple technology streams. For example, a "Payments" delivery stream may require changes in the Core API, Auth, and Frontend orgs simultaneously.

Delivery streams are expected to change more frequently than technology streams (new product initiatives, team reorganisations). The platform must support adding, renaming, and archiving delivery streams without code changes.

### 2.3 Cross-Stream Relationships

The relationship between delivery streams and technology streams is many-to-many. A single work item may touch one or more technology streams. A technology stream may serve multiple delivery streams. This cross-cutting relationship is critical to the platform's ability to identify shared infrastructure bottlenecks.

---

## 3. Authentication and Authorisation

### 3.1 Overview

The platform must support multiple authentication methods to accommodate production use (SSO via Microsoft Entra ID) and non-production environments (database-backed local authentication). The authentication mechanism must be configurable per environment without code changes.

### 3.2 Authentication Methods

#### 3.2.1 Microsoft Entra ID (Production)

The production deployment authenticates users via Microsoft Entra ID (formerly Azure Active Directory) using the OpenID Connect (OIDC) protocol.

**Flow:**

1. User accesses the platform and is redirected to the Entra ID login page.
2. User authenticates (including any MFA requirements enforced by Entra ID policy).
3. Entra ID redirects back to the platform with an authorisation code.
4. The platform exchanges the code for an ID token and access token.
5. The platform extracts the user's identity (email, display name, group memberships) from the ID token claims.
6. A platform session is created. Group memberships are mapped to platform roles (see §3.3).

**Configuration Parameters:**

| Parameter | Description |
|---|---|
| AUTH_METHOD | Set to `oidc` |
| OIDC_ISSUER_URL | Entra ID tenant issuer URL |
| OIDC_CLIENT_ID | Application (client) ID registered in Entra ID |
| OIDC_CLIENT_SECRET | Client secret (stored in secrets management, not in config files) |
| OIDC_REDIRECT_URI | Callback URL for the platform |
| OIDC_SCOPES | `openid profile email` (minimum) |
| OIDC_GROUP_CLAIM | The token claim containing group memberships (default: `groups`) |

**Entra ID Application Registration Requirements:**

- Redirect URI must be registered for each environment.
- Token configuration must include the `groups` claim (or a custom claim mapping to delivery-stream / tech-stream roles).
- The platform does not require any Microsoft Graph API permissions beyond the ID token claims.

#### 3.2.2 Database Authentication (Non-Production)

Non-production environments (development, test, staging) may use database-backed authentication where user credentials are stored locally.

**Flow:**

1. User submits username and password to the platform login endpoint.
2. The platform validates credentials against the `users` table.
3. Passwords are stored as salted hashes using a modern key-derivation function (bcrypt, scrypt, or Argon2 — implementation choice).
4. A platform session is created.

**Configuration Parameters:**

| Parameter | Description |
|---|---|
| AUTH_METHOD | Set to `database` |
| PASSWORD_HASH_ALGORITHM | Algorithm identifier (e.g. `argon2id`) |
| SESSION_DURATION_MINUTES | Session timeout (default: 480) |

**Database Schema (users table — non-production only):**

```
users
├── user_id             UUID        PRIMARY KEY
├── email               VARCHAR     UNIQUE NOT NULL
├── display_name        VARCHAR     NOT NULL
├── password_hash       VARCHAR     NOT NULL
├── is_active           BOOLEAN     DEFAULT TRUE
├── created_at          TIMESTAMPTZ DEFAULT NOW()
└── last_login_at       TIMESTAMPTZ
```

#### 3.2.3 API Key Authentication (Service-to-Service)

External integrations (e.g. CI/CD pipelines pushing deployment events) authenticate using API keys.

**Flow:**

1. API request includes key in the `Authorization: Bearer {api_key}` header.
2. The platform validates the key against the `api_keys` table.
3. The key's associated permissions and stream scope determine what data can be written.

**Database Schema:**

```
api_keys
├── key_id              UUID        PRIMARY KEY
├── key_hash            VARCHAR     NOT NULL  (hashed, never stored in plain text)
├── display_name        VARCHAR     NOT NULL
├── permissions         VARCHAR[]   NOT NULL  (e.g. ['events:write', 'metrics:read'])
├── stream_scope        JSONB       (optional restriction to specific streams)
├── is_active           BOOLEAN     DEFAULT TRUE
├── created_by          UUID        REFERENCES users
├── created_at          TIMESTAMPTZ DEFAULT NOW()
├── last_used_at        TIMESTAMPTZ
└── expires_at          TIMESTAMPTZ (NULL = no expiry)
```

### 3.3 Authorisation Model

The platform uses role-based access control (RBAC). Roles determine what data a user can see and what actions they can take.

| Role | Description | Permissions |
|---|---|---|
| viewer | Read-only access to dashboards and metrics | View metrics for assigned streams |
| team_member | Standard team access | Viewer permissions + submit pulse survey responses |
| stream_lead | Delivery or tech stream lead | Team member permissions + manage stream configuration, view diagnostic detail |
| platform_admin | Platform administrator | All permissions + manage users, API keys, stream config, and system settings |

**Role Assignment:**

- In OIDC mode: Entra ID group memberships are mapped to platform roles via a configurable mapping table.
- In database mode: Roles are assigned directly in the `user_roles` table.

**Stream Scoping:**

Users may be scoped to specific delivery streams and/or technology streams. A user scoped to the "Payments" delivery stream sees only metrics for that stream. Platform admins and cross-stream roles see all streams.

```
user_roles
├── user_role_id        UUID        PRIMARY KEY
├── user_id             UUID        NOT NULL
├── role                VARCHAR     NOT NULL
├── delivery_stream_id  UUID        (NULL = all streams)
├── tech_stream_id      UUID        (NULL = all streams)
├── granted_by          UUID        REFERENCES users
├── granted_at          TIMESTAMPTZ DEFAULT NOW()
└── UNIQUE (user_id, role, delivery_stream_id, tech_stream_id)
```

**Session Management:**

```
sessions
├── session_id          UUID        PRIMARY KEY
├── user_id             UUID        REFERENCES users NOT NULL
├── auth_method         VARCHAR     NOT NULL ('oidc' | 'database')
├── created_at          TIMESTAMPTZ DEFAULT NOW()
├── expires_at          TIMESTAMPTZ NOT NULL
├── last_activity_at    TIMESTAMPTZ
└── is_revoked          BOOLEAN     DEFAULT FALSE
```

API key authentication is stateless and does not create session records. API key usage is tracked via the `last_used_at` field on the `api_keys` table (§3.2.3).

### 3.4 Authentication Configuration Summary

The platform reads the `AUTH_METHOD` environment variable at startup and initialises the corresponding authentication provider. Only one primary interactive method is active per deployment, but API key authentication is always available in parallel.

| Environment | AUTH_METHOD | Interactive Auth | API Auth |
|---|---|---|---|
| Production | `oidc` | Microsoft Entra ID SSO | API keys |
| Staging | `oidc` or `database` | Configurable | API keys |
| Test | `database` | Local credentials | API keys |
| Development | `database` | Local credentials | API keys |

---

## 4. Data Model

### 4.1 Overview

The data model is divided into three layers:

1. **Configuration** — Stream definitions, org mappings, status mappings.
2. **Events** — Immutable records of source-system occurrences.
3. **Metrics** — Computed and materialised views derived from events.

All timestamps are stored in UTC with timezone information (TIMESTAMPTZ or equivalent). All identifiers use UUIDs generated by the platform. External identifiers (Jira keys, GitHub IDs, deployment IDs) are stored as text and indexed.

### 4.2 Configuration Tables

#### 4.2.1 Delivery Streams

```
delivery_streams
├── stream_id           UUID        PRIMARY KEY
├── name                VARCHAR     UNIQUE NOT NULL
├── display_name        VARCHAR     NOT NULL
├── description         TEXT
├── is_active           BOOLEAN     DEFAULT TRUE
├── created_at          TIMESTAMPTZ DEFAULT NOW()
└── updated_at          TIMESTAMPTZ DEFAULT NOW()
```

#### 4.2.2 Technology Streams

```
tech_streams
├── stream_id           UUID        PRIMARY KEY
├── name                VARCHAR     UNIQUE NOT NULL  (e.g. 'core-api')
├── display_name        VARCHAR     NOT NULL          (e.g. 'Core API')
├── github_org          VARCHAR     UNIQUE NOT NULL   (e.g. 'acme-core-api')
├── github_install_id   VARCHAR     NOT NULL          (GitHub App installation ID)
├── description         TEXT
├── is_active           BOOLEAN     DEFAULT TRUE
├── created_at          TIMESTAMPTZ DEFAULT NOW()
└── updated_at          TIMESTAMPTZ DEFAULT NOW()
```

#### 4.2.3 Jira Status → Pipeline Stage Mapping

Jira workflow statuses vary between projects. This table provides the configurable mapping from Jira status names to the platform's canonical pipeline stages.

```
status_mappings
├── mapping_id          UUID        PRIMARY KEY
├── jira_project_key    VARCHAR     NOT NULL
├── jira_status_name    VARCHAR     NOT NULL
├── pipeline_stage      VARCHAR     NOT NULL  CHECK (pipeline_stage IN ('backlog','ba','dev','code_review','qa','uat','done','cancelled'))
├── is_active_work      BOOLEAN     NOT NULL  (TRUE if this status represents active work, FALSE if it is a wait/queue state)
├── display_order       INTEGER     NOT NULL
├── UNIQUE (jira_project_key, jira_status_name)
```

The `is_active_work` flag is critical for flow efficiency computation. Statuses like "In Progress" and "In Review" are active; statuses like "Ready for QA" and "Awaiting UAT" are wait states.

#### 4.2.4 Repository Registry

Populated automatically from GitHub org membership, used for reference and override configuration.

```
repositories
├── repo_id             UUID        PRIMARY KEY
├── tech_stream_id      UUID        REFERENCES tech_streams NOT NULL
├── github_org          VARCHAR     NOT NULL
├── github_repo_name    VARCHAR     NOT NULL
├── full_name           VARCHAR     NOT NULL  (e.g. 'acme-core-api/payments-service')
├── default_branch      VARCHAR     DEFAULT 'main'
├── is_deployable       BOOLEAN     DEFAULT TRUE  (FALSE for libraries, shared modules)
├── deploy_target       VARCHAR     (e.g. 'ecs:payments-service', 'lambda:token-validator')
├── is_active           BOOLEAN     DEFAULT TRUE
├── UNIQUE (github_org, github_repo_name)
```

#### 4.2.5 Sprint Registry

```
sprints
├── sprint_id           UUID        PRIMARY KEY
├── jira_sprint_id      VARCHAR     UNIQUE NOT NULL
├── delivery_stream_id  UUID        REFERENCES delivery_streams
├── name                VARCHAR     NOT NULL
├── start_date          DATE        NOT NULL
├── end_date            DATE        NOT NULL
├── goal                TEXT
├── state               VARCHAR     CHECK (state IN ('future','active','closed'))
```

### 4.3 Event Tables

All event tables share common columns for traceability and stream attribution. Events are append-only; they are never updated or deleted in normal operation.

#### 4.3.1 Common Event Columns

Every event table includes the following base columns:

```
├── event_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid()
├── source              VARCHAR     NOT NULL  ('jira' | 'github' | 'deployment' | 'monitoring' | 'survey')
├── delivery_stream_id  UUID        REFERENCES delivery_streams  (nullable — enriched post-ingestion)
├── tech_stream_id      UUID        REFERENCES tech_streams       (nullable for Jira-only events)
├── received_at         TIMESTAMPTZ DEFAULT NOW()
├── event_timestamp     TIMESTAMPTZ NOT NULL  (when the event occurred in the source system)
```

**Idempotency is handled per-table, not via a shared constraint.** A single source entity (e.g. a Jira ticket, a pull request) produces multiple events over its lifecycle — status transitions, reviews, deployments, and so on. What constitutes a "duplicate" differs by event type. Each event table defines its own composite unique constraint reflecting the natural dedup key for that event type. These are documented alongside each table definition below.

#### 4.3.2 Work Item Events

Captures every status transition, creation, and completion of Jira tickets.

```
work_item_events
├── [common event columns]
├── event_type          VARCHAR     NOT NULL CHECK (event_type IN ('created','transitioned','completed','blocked','unblocked','flagged','unflagged'))
├── ticket_id           VARCHAR     NOT NULL  (e.g. 'PAY-456')
├── ticket_type         VARCHAR     (e.g. 'story', 'task', 'bug', 'spike')
├── from_stage          VARCHAR     (pipeline stage, NULL for 'created' events)
├── to_stage            VARCHAR     (pipeline stage)
├── assignee_hash       VARCHAR     (anonymised identifier — see §4.6)
├── story_points        NUMERIC
├── priority            VARCHAR
├── sprint_id           UUID        REFERENCES sprints
├── labels              VARCHAR[]
├── blocked_reason      TEXT        (populated for 'blocked' events)
├── blocking_tech_stream_id UUID    REFERENCES tech_streams  (for cross-stream correlation)
├──
├── UNIQUE (ticket_id, event_type, event_timestamp)
│   -- A given ticket can only have one event of a given type at a given timestamp.
│   -- This rejects duplicate webhook deliveries while allowing multiple transitions
│   -- for the same ticket over time.
├──
├── INDEX (ticket_id)
├── INDEX (delivery_stream_id, event_timestamp)
├── INDEX (to_stage, event_timestamp)
```

#### 4.3.3 Pull Request Events

Captures PR lifecycle from GitHub across all organisations.

```
pr_events
├── [common event columns]
├── event_type          VARCHAR     NOT NULL CHECK (event_type IN ('opened','review_submitted','changes_requested','approved','merged','closed'))
├── pr_number           INTEGER     NOT NULL
├── repo_id             UUID        REFERENCES repositories
├── github_org          VARCHAR     NOT NULL
├── github_repo         VARCHAR     NOT NULL
├── author_hash         VARCHAR     NOT NULL  (anonymised)
├── branch_name         VARCHAR     NOT NULL
├── linked_ticket_id    VARCHAR     (extracted from branch name)
├── base_branch         VARCHAR     (e.g. 'main')
├── lines_added         INTEGER
├── lines_removed       INTEGER
├── files_changed       INTEGER
├── reviewer_hash       VARCHAR     (for review_submitted events)
├── review_state        VARCHAR     (e.g. 'approved', 'changes_requested', 'commented')
├── comments_count      INTEGER
├──
├── UNIQUE (repo_id, pr_number, event_type, event_timestamp)
│   -- A PR can have multiple reviews, multiple approvals (after changes), etc.
│   -- The timestamp distinguishes successive events of the same type on the same PR.
├──
├── INDEX (linked_ticket_id)
├── INDEX (tech_stream_id, event_timestamp)
├── INDEX (repo_id, pr_number)
```

#### 4.3.4 CI/CD Events

Captures continuous integration and deployment pipeline outcomes.

```
cicd_events
├── [common event columns]
├── event_type          VARCHAR     NOT NULL CHECK (event_type IN ('build_started','build_completed','deploy_started','deploy_completed','deploy_failed','rollback_initiated','rollback_completed'))
├── pipeline_id         VARCHAR     NOT NULL  (CI/CD system identifier)
├── pipeline_run_id     VARCHAR     NOT NULL  (unique run/execution identifier within the pipeline)
├── repo_id             UUID        REFERENCES repositories
├── environment         VARCHAR     NOT NULL  (e.g. 'dev', 'staging', 'production')
├── status              VARCHAR     NOT NULL  (e.g. 'success', 'failure', 'cancelled')
├── duration_seconds    INTEGER
├── commit_sha          VARCHAR
├── linked_pr_number    INTEGER
├── linked_ticket_id    VARCHAR     (derived via PR → branch → ticket)
├── trigger_type        VARCHAR     (e.g. 'push', 'merge', 'manual', 'schedule')
├── artefact_version    VARCHAR
├── failure_reason      TEXT        (populated on failure)
├──
├── UNIQUE (pipeline_id, pipeline_run_id, event_type)
│   -- A given pipeline run produces exactly one event per lifecycle stage
│   -- (e.g. one deploy_started and one deploy_completed). The run_id + event_type
│   -- combination is globally unique.
├──
├── INDEX (environment, status, event_timestamp)
├── INDEX (commit_sha)
├── INDEX (linked_ticket_id)
```

#### 4.3.5 Incident Events

Captures production incidents and their resolution.

```
incident_events
├── [common event columns]
├── event_type          VARCHAR     NOT NULL CHECK (event_type IN ('alarm_triggered','alarm_resolved','incident_opened','incident_resolved'))
├── incident_id         VARCHAR     NOT NULL  (monitoring system or incident management ID)
├── service_name        VARCHAR     NOT NULL
├── severity            VARCHAR     CHECK (severity IN ('critical','high','medium','low'))
├── description         TEXT
├── related_deploy_id   VARCHAR     (linked deployment event, if correlated)
├── resolved_at         TIMESTAMPTZ (populated on resolution)
├── time_to_restore_min INTEGER     (computed: resolved - triggered, in minutes)
├──
├── UNIQUE (incident_id, event_type)
│   -- An incident has exactly one 'triggered' and one 'resolved' event.
│   -- This allows both lifecycle events while rejecting duplicate deliveries.
├──
├── INDEX (tech_stream_id, event_timestamp)
├── INDEX (incident_id)
├── INDEX (related_deploy_id)
```

#### 4.3.6 Defect Events

Captures bug reports with stage attribution for defect escape analysis.

```
defect_events
├── [common event columns]
├── event_type          VARCHAR     NOT NULL CHECK (event_type IN ('logged','attributed','reclassified'))
├── ticket_id           VARCHAR     NOT NULL  (Jira bug ticket ID)
├── severity            VARCHAR     CHECK (severity IN ('critical','high','medium','low'))
├── found_in_stage      VARCHAR     NOT NULL  (pipeline stage where bug was discovered)
├── introduced_in_stage VARCHAR     (pipeline stage where bug is believed to have originated — populated on 'attributed' and 'reclassified' events)
├── linked_work_item_id VARCHAR     (the original ticket the defect relates to)
├── root_cause_category VARCHAR     (e.g. 'requirements', 'logic', 'integration', 'configuration', 'regression')
├──
├── UNIQUE (ticket_id, event_type, event_timestamp)
│   -- A defect ticket produces a 'logged' event on creation. When triage assigns
│   -- introduced_in_stage, an 'attributed' event is appended. If attribution is
│   -- later revised, a 'reclassified' event is appended. The defect escape rate
│   -- computation uses the latest event per ticket_id (by event_timestamp) to
│   -- determine the current attribution. This preserves the append-only principle
│   -- while supporting the iterative nature of defect root-cause analysis.
├──
├── INDEX (delivery_stream_id, found_in_stage)
├── INDEX (tech_stream_id, event_timestamp)
├── INDEX (ticket_id, event_timestamp)
```

#### 4.3.7 Sprint Snapshot Events

Periodic point-in-time captures of sprint state. Unlike other events, these are generated by the platform's scheduled polling, not by webhooks.

```
sprint_snapshots
├── [common event columns]
├── sprint_id           UUID        REFERENCES sprints NOT NULL
├── snapshot_date       DATE        NOT NULL
├── committed_count     INTEGER     NOT NULL
├── completed_count     INTEGER     NOT NULL
├── remaining_count     INTEGER     NOT NULL
├── added_after_start   INTEGER     DEFAULT 0
├── removed_after_start INTEGER     DEFAULT 0
├── wip_ba              INTEGER     DEFAULT 0
├── wip_dev             INTEGER     DEFAULT 0
├── wip_qa              INTEGER     DEFAULT 0
├── wip_uat             INTEGER     DEFAULT 0
├── UNIQUE (sprint_id, snapshot_date)
│   -- One snapshot per sprint per day. Re-running the poller on the same day
│   -- overwrites the previous snapshot (upsert) rather than creating a duplicate.
```

#### 4.3.8 Pulse Survey Responses

Anonymous team health survey data.

```
pulse_responses
├── [common event columns]
├── survey_period       VARCHAR     NOT NULL  (e.g. '2026-02' for February 2026)
├── respondent_hash     VARCHAR     NOT NULL  (anonymised, allows trend tracking without identification)
├── pace_score          INTEGER     NOT NULL CHECK (pace_score BETWEEN 1 AND 5)
├── tooling_score       INTEGER     NOT NULL CHECK (tooling_score BETWEEN 1 AND 5)
├── clarity_score       INTEGER     NOT NULL CHECK (clarity_score BETWEEN 1 AND 5)
├── free_text           TEXT        (optional, not displayed on dashboards — for retro use only)
├── UNIQUE (survey_period, respondent_hash, delivery_stream_id)
│   -- One response per person per stream per survey period. Resubmission
│   -- overwrites the previous response (upsert).
```

### 4.4 Computed Metric Tables

Metrics are derived from events and stored in tables optimised for dashboard queries. These tables are periodically recomputed and may be dropped and rebuilt from the event log without data loss.

#### 4.4.1 Daily Stream Metrics

Aggregated daily metrics per delivery stream and per technology stream. This is the primary table backing the dashboard's trend views.

```
daily_stream_metrics
├── metric_id           UUID        PRIMARY KEY
├── metric_date         DATE        NOT NULL
├── stream_type         VARCHAR     NOT NULL  ('delivery' | 'tech')
├── stream_id           UUID        NOT NULL
├── metric_name         VARCHAR     NOT NULL  (see §6 for enumerated metric names)
├── metric_value        NUMERIC     NOT NULL
├── metric_unit         VARCHAR     NOT NULL  (e.g. 'days', 'percent', 'count', 'per_week')
├── percentile          INTEGER     (populated for distribution metrics: 50, 85, 95)
├── sample_size         INTEGER     NOT NULL  (number of data points used in computation)
├── computed_at         TIMESTAMPTZ DEFAULT NOW()
├── UNIQUE (metric_date, stream_type, stream_id, metric_name, percentile)
├── INDEX (stream_id, metric_name, metric_date)
```

#### 4.4.2 Work Item Cycle Data

Per-work-item computed lifecycle data. Populated when a work item reaches "done."

```
work_item_cycles
├── cycle_id            UUID        PRIMARY KEY
├── ticket_id           VARCHAR     UNIQUE NOT NULL
├── delivery_stream_id  UUID        REFERENCES delivery_streams
├── tech_stream_ids     UUID[]      (all tech streams touched by this item)
├── ticket_type         VARCHAR
├── story_points        NUMERIC
├── created_at          TIMESTAMPTZ NOT NULL
├── first_in_progress   TIMESTAMPTZ (first transition to an active-work stage)
├── completed_at        TIMESTAMPTZ NOT NULL
├── lead_time_days      NUMERIC     NOT NULL  (created → completed, in business days)
├── cycle_time_days     NUMERIC     NOT NULL  (first_in_progress → completed, in business days)
├── active_time_days    NUMERIC     NOT NULL  (sum of time in is_active_work=TRUE stages)
├── wait_time_days      NUMERIC     NOT NULL  (sum of time in is_active_work=FALSE stages)
├── flow_efficiency_pct NUMERIC     NOT NULL  (active_time / cycle_time × 100)
├── stage_durations     JSONB       NOT NULL  (e.g. {"ba": 1.2, "dev": 3.0, "qa_queue": 2.1, "qa": 0.8, "uat_queue": 1.5, "uat": 0.5})
├── sprint_id           UUID        REFERENCES sprints
├── INDEX (delivery_stream_id, completed_at)
├── INDEX (completed_at)
```

#### 4.4.3 PR Cycle Data

Per-pull-request computed lifecycle data. Populated when a PR is merged or closed.

```
pr_cycles
├── cycle_id            UUID        PRIMARY KEY
├── repo_id             UUID        REFERENCES repositories NOT NULL
├── tech_stream_id      UUID        REFERENCES tech_streams NOT NULL
├── delivery_stream_id  UUID        REFERENCES delivery_streams
├── pr_number           INTEGER     NOT NULL
├── linked_ticket_id    VARCHAR
├── author_hash         VARCHAR     NOT NULL
├── opened_at           TIMESTAMPTZ NOT NULL
├── first_review_at     TIMESTAMPTZ
├── approved_at         TIMESTAMPTZ
├── merged_at           TIMESTAMPTZ
├── time_to_first_review_hrs  NUMERIC  (first_review_at - opened_at, in hours)
├── time_to_merge_hrs         NUMERIC  (merged_at - opened_at, in hours)
├── review_rounds       INTEGER     (number of review submissions)
├── reviewer_hashes     VARCHAR[]   (anonymised list of reviewers)
├── reviewer_count      INTEGER
├── lines_changed       INTEGER     (added + removed)
├── files_changed       INTEGER
├── UNIQUE (repo_id, pr_number)
├── INDEX (tech_stream_id, merged_at)
├── INDEX (delivery_stream_id, merged_at)
```

#### 4.4.4 Deployment Records

Per-deployment computed data, linking a deployment back to its source PR, commit, and work item.

```
deployment_records
├── record_id           UUID        PRIMARY KEY
├── tech_stream_id      UUID        REFERENCES tech_streams NOT NULL
├── delivery_stream_id  UUID        REFERENCES delivery_streams
├── repo_id             UUID        REFERENCES repositories
├── environment         VARCHAR     NOT NULL
├── deployed_at         TIMESTAMPTZ NOT NULL
├── status              VARCHAR     NOT NULL  ('success' | 'failed' | 'rolled_back')
├── commit_sha          VARCHAR
├── linked_pr_number    INTEGER
├── linked_ticket_id    VARCHAR
├── lead_time_hrs       NUMERIC     (PR opened → deploy, or first commit → deploy — see §6.4.4 for method)
├── caused_incident     BOOLEAN     DEFAULT FALSE
├── incident_id         VARCHAR
├── rollback_at         TIMESTAMPTZ (if rolled back)
├── INDEX (tech_stream_id, environment, deployed_at)
├── INDEX (environment, deployed_at)
├── INDEX (linked_ticket_id)
```

#### 4.4.5 Cross-Stream Correlation

Materialised view identifying shared technology dependencies and their impact on delivery streams.

```
cross_stream_correlations
├── correlation_id      UUID        PRIMARY KEY
├── analysis_date       DATE        NOT NULL
├── tech_stream_id      UUID        REFERENCES tech_streams NOT NULL
├── impacted_delivery_streams  UUID[]   NOT NULL
├── blocked_delivery_streams   UUID[]   (subset of impacted that are actively blocked)
├── block_count_14d     INTEGER     NOT NULL  (ticket_blocked events in rolling 14 days)
├── avg_confidence_pct  NUMERIC     (average sprint confidence across impacted streams)
├── avg_cycle_time_p85  NUMERIC     (average p85 cycle time across impacted streams)
├── severity            VARCHAR     CHECK (severity IN ('none','low','medium','high','critical'))
├── computed_at         TIMESTAMPTZ DEFAULT NOW()
├── UNIQUE (analysis_date, tech_stream_id)
```

#### 4.4.6 Forecast Snapshots

Results of Monte Carlo simulations for delivery forecasting.

```
forecast_snapshots
├── forecast_id         UUID        PRIMARY KEY
├── delivery_stream_id  UUID        REFERENCES delivery_streams NOT NULL
├── forecast_date       DATE        NOT NULL  (date the forecast was generated)
├── scope_item_count    INTEGER     NOT NULL  (remaining items to deliver)
├── throughput_samples  INTEGER     NOT NULL  (weeks of historical data used)
├── simulation_runs     INTEGER     NOT NULL  (number of Monte Carlo iterations)
├── p50_completion_date DATE        NOT NULL
├── p70_completion_date DATE        NOT NULL
├── p85_completion_date DATE        NOT NULL
├── p95_completion_date DATE        NOT NULL
├── distribution_data   JSONB       NOT NULL  (histogram of completion dates for chart rendering)
├── computed_at         TIMESTAMPTZ DEFAULT NOW()
├── INDEX (delivery_stream_id, forecast_date)
```

#### 4.4.7 Pulse Survey Aggregates

Aggregated (never individual) survey results per delivery stream per period.

```
pulse_aggregates
├── aggregate_id        UUID        PRIMARY KEY
├── delivery_stream_id  UUID        REFERENCES delivery_streams NOT NULL
├── survey_period       VARCHAR     NOT NULL  (e.g. '2026-02')
├── response_count      INTEGER     NOT NULL
├── team_size           INTEGER     NOT NULL
├── response_rate_pct   NUMERIC     NOT NULL
├── pace_avg            NUMERIC     NOT NULL
├── pace_trend          NUMERIC     (change from previous period)
├── tooling_avg         NUMERIC     NOT NULL
├── tooling_trend       NUMERIC
├── clarity_avg         NUMERIC     NOT NULL
├── clarity_trend       NUMERIC
├── overall_avg         NUMERIC     NOT NULL  (mean of three dimensions)
├── computed_at         TIMESTAMPTZ DEFAULT NOW()
├── UNIQUE (delivery_stream_id, survey_period)
```

### 4.5 Entity Relationship Summary

```
delivery_streams  ──┐
                    ├── work_item_events
tech_streams ───────┤
                    ├── pr_events
repositories ───────┤
                    ├── cicd_events
sprints ────────────┤
                    ├── incident_events
status_mappings ────┤
                    ├── defect_events
                    │
                    └── [computed metrics tables]
```

### 4.6 Anonymisation Policy

The platform stores anonymised identifiers for individuals, not names or email addresses. The anonymisation process works as follows:

1. On event ingestion, the source system's user identifier (e.g. Jira account ID, GitHub username) is passed through a one-way keyed hash function (HMAC-SHA256 with a platform-managed key).
2. The resulting hash is stored as `author_hash`, `assignee_hash`, `reviewer_hash`, or `respondent_hash`.
3. The same individual always produces the same hash, allowing for distribution analysis (e.g. "reviewer X handles 80% of PRs") without identifying the individual.
4. The HMAC key is stored in secrets management and is never exposed. If the key is rotated, all hashes become unlinkable to their predecessors.

This approach allows the platform to detect patterns (knowledge silos, uneven review distribution) while maintaining the principle that the platform measures process, not people.

**Small-Team Safeguard:** When a technology stream or delivery stream has fewer than a configurable minimum number of contributors (default: 6) in the analysis window, the platform must suppress individual-level distribution metrics (e.g. reviewer concentration percentages, per-author PR counts). In these cases, the platform displays only the aggregate signal (e.g. "review load is unevenly distributed") without the breakdown that would enable identification. This threshold is configurable per stream and applies to all metrics that use hashed individual identifiers.

---

## 5. Source System Integration

### 5.1 Integration Architecture

Events are collected from source systems and processed through a pipeline with five stages:

1. **Collect** — Webhook receivers and scheduled pollers ingest raw events.
2. **Deduplicate** — Per-table composite unique constraints reject duplicate events (see §4.3 for each table's dedup key).
3. **Normalise** — Raw payloads are mapped to the platform's event schemas.
4. **Enrich** — Events are tagged with `delivery_stream_id` and `tech_stream_id` via lookup and cross-referencing.
5. **Store** — Events are written to the relational database (event tables) and optionally to an immutable archive (file-based event log for disaster recovery and full reprocessing).

All integrations are designed to be webhook-primary with API-based backfill as a secondary mechanism. In steady state, the platform should make minimal outbound API calls to source systems.

### 5.2 Jira Integration

#### 5.2.1 Connection Method

Webhooks for real-time events, REST API for scheduled snapshots and backfill.

#### 5.2.2 Authentication

API token associated with a service account. The service account requires read-only access to all projects that feed into delivery streams.

#### 5.2.3 Webhook Events

The following Jira webhook events are subscribed to:

| Jira Webhook Event | Platform Event Type | Key Mapping |
|---|---|---|
| `jira:issue_created` | `work_item_events.created` | Ticket key, type, priority, sprint, labels → delivery_stream |
| `jira:issue_updated` (status change) | `work_item_events.transitioned` | From/to status → pipeline stage via status_mappings table |
| `jira:issue_updated` (flagged) | `work_item_events.blocked` / `work_item_events.unblocked` | Flag state, blocked reason if available |
| `jira:issue_updated` (resolution set) | `work_item_events.completed` | Resolution, completed timestamp |

#### 5.2.4 Delivery Stream Derivation

The delivery stream for a Jira ticket is determined by the following priority order:

1. A dedicated custom field (`delivery_stream`) on the ticket — most reliable.
2. The Jira project key, if projects map 1:1 to delivery streams — simplest.
3. A Jira label matching a delivery stream name — most flexible.
4. A component assignment, if components map to delivery streams.

The chosen method is configured per Jira project in the platform. Multiple methods may be combined with a defined fallback order. If no delivery stream can be determined, the event is stored with `delivery_stream_id = NULL` and flagged for triage (see §5.6).

#### 5.2.5 Technology Stream Derivation

Jira tickets are assigned technology streams through a multi-select custom field (`tech_streams`) on the ticket. This field should be required in the Jira workflow. If not populated, the platform infers tech streams from linked pull requests once PR events arrive.

#### 5.2.6 Scheduled Polling

The following data is collected via the Jira REST API on a schedule:

| Data | Schedule | Purpose |
|---|---|---|
| Sprint state (active sprints) | Every 2 hours | Sprint snapshot events — committed/completed/remaining counts, WIP by stage |
| Sprint retrospective (closed sprints) | On sprint close (daily check) | Final sprint metrics — velocity, commitment accuracy |
| Backlog state | Daily | Remaining scope count for Monte Carlo forecasting |

#### 5.2.7 Defect Events

Bug-type tickets generate both a `work_item_events.created` event and a `defect_events` record. The defect event requires:

- `found_in_stage`: Derived from the current pipeline stage of the linked parent ticket, or from a dedicated custom field.
- `introduced_in_stage`: A custom field on the bug ticket. This field requires team discipline to populate and should be set during triage or root-cause analysis.

If `introduced_in_stage` is not populated, it defaults to NULL. The defect escape analysis should report the percentage of defects with unknown origin as a data quality metric.

### 5.3 GitHub Integration

#### 5.3.1 Connection Method

A single GitHub App installed across all organisations. Webhooks for real-time events, REST/GraphQL API for backfill and enrichment.

#### 5.3.2 GitHub App Configuration

| Parameter | Value |
|---|---|
| App Name | {Company} Delivery Metrics |
| Homepage URL | Platform URL |
| Webhook URL | Platform webhook endpoint (single URL for all orgs) |
| Webhook Secret | Shared secret for HMAC-SHA256 payload verification |

**Required Permissions (all read-only):**

| Permission | Scope | Purpose |
|---|---|---|
| Contents | Repository | Commit history for lead time computation |
| Pull requests | Repository | PR lifecycle events, review data, branch names |
| Checks | Repository | CI run outcomes |
| Actions | Repository | Workflow run events for deployment frequency |
| Metadata | Repository | Repository names, default branches |
| Members | Organisation | Team structure for reviewer distribution analysis |

**Subscribed Webhook Events:**

| GitHub Event | Platform Event Type |
|---|---|
| `pull_request` (opened) | `pr_events.opened` |
| `pull_request_review` (submitted) | `pr_events.review_submitted` |
| `pull_request` (closed + merged) | `pr_events.merged` |
| `pull_request` (closed + not merged) | `pr_events.closed` |
| `workflow_run` (completed) | `cicd_events.build_completed` |
| `deployment_status` (success/failure) | `cicd_events.deploy_completed` / `cicd_events.deploy_failed` |

#### 5.3.3 Webhook Processing

1. Receive POST request at the webhook endpoint.
2. Validate `X-Hub-Signature-256` header using the shared webhook secret. Reject if invalid.
3. Extract `installation.id` from the payload.
4. Look up `tech_stream_id` from the `tech_streams` table using `github_install_id`.
5. If the event relates to a PR, extract the Jira ticket key from the branch name.
6. Normalise the payload into the appropriate platform event schema.
7. Write to the event table. The per-table composite unique constraint handles deduplication (e.g. for PR events: `repo_id + pr_number + event_type + timestamp`).

#### 5.3.4 Branch Name → Ticket Linking

The platform extracts a Jira ticket key from PR metadata using the following methods, attempted in priority order:

1. **Branch name (primary):** A configurable regular expression applied to the PR's head branch name. The default pattern is:

```
^(?:feature|bugfix|hotfix|chore|spike)?/?([A-Z][A-Z0-9]+-\d+)
```

This matches patterns like `PAY-456-retry-logic`, `feature/PAY-456-retry-logic`, and `bugfix/AUTH-78-fix-token-expiry`.

2. **PR title (secondary):** The same regex applied to the PR title. Many teams include the ticket key in the title (e.g. "PAY-456: Add retry logic").

3. **PR body (tertiary):** Scan the PR description for Jira ticket key patterns. This catches teams that use PR templates with a "Jira ticket:" field.

4. **Manual link (fallback):** The platform provides a UI and API endpoint to manually associate unlinked PRs with Jira tickets. This serves as both a correction mechanism and a safety net for non-standard workflows.

The regex pattern is configurable per technology stream to accommodate teams with different naming conventions. If no ticket key is extracted by any method, the event is stored with `linked_ticket_id = NULL`. The platform tracks the percentage of PRs without linked tickets as a data quality metric (§5.6), and the admin dashboard should surface unlinked PRs for manual triage.

#### 5.3.5 Technology Stream Derivation

Technology stream is always derived from the GitHub organisation that sent the webhook. Since orgs map 1:1 to tech streams, this is deterministic and requires no configuration beyond the initial `tech_streams` table entry.

#### 5.3.6 Delivery Stream Derivation

Delivery stream is derived indirectly via the linked Jira ticket:

1. Extract ticket key from branch name.
2. Look up the ticket's delivery stream from the `work_item_events` table (populated by the Jira integration).
3. If the ticket hasn't been seen yet (race condition — PR opened before Jira event processed), queue a deferred enrichment job to retry after a configurable delay (default: 5 minutes).

#### 5.3.7 API Usage

The GitHub API is used only for:

| Use Case | Method | Frequency |
|---|---|---|
| Initial historical backfill | GraphQL API | One-time per org, rate-limit aware |
| Deferred enrichment | REST API (single-resource lookups) | Low volume, on-demand |
| Gap detection and recovery | GraphQL API | Daily scheduled check |
| Repository list sync | REST API | Daily per org |

Each API call authenticates using an installation token generated for the specific org, ensuring that the token can only access that org's private repositories.

**Rate Limit Management:**

- GitHub App installation tokens have a rate limit of 5,000 requests/hour per org.
- The platform tracks the `X-RateLimit-Remaining` header on every API response.
- If remaining requests fall below a configurable threshold (default: 500), non-critical API calls are deferred.
- Backfill operations run during off-peak hours and process one org at a time.

### 5.4 Deployment and Infrastructure Integration

#### 5.4.1 Connection Method

The platform receives deployment and infrastructure events through one or more of the following mechanisms, depending on the organisation's CI/CD tooling:

1. **GitHub Actions Deployment Events** — received via the GitHub App webhooks (see §5.3). This is the preferred method if deployments are triggered by GitHub Actions workflows.
2. **Webhook Push from CI/CD Pipeline** — the CI/CD pipeline calls the platform's event ingestion API at the end of a deployment step, authenticated via API key (see §3.2.3).
3. **Monitoring System Webhooks** — alerting and monitoring systems push incident events to the platform's event ingestion API.

#### 5.4.2 Event Ingestion API

The platform exposes a REST API for external systems to push events:

```
POST /api/v1/events/deployment
POST /api/v1/events/incident
```

**Request Headers:**

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer {api_key}` |
| `Content-Type` | Yes | `application/json` |
| `X-Idempotency-Key` | Recommended | Client-provided dedup key (falls back to payload hash) |

**Deployment Event Payload:**

```json
{
  "pipeline_id": "string (CI/CD system identifier)",
  "environment": "string (dev | staging | production)",
  "status": "string (success | failure | cancelled)",
  "repo_full_name": "string (e.g. acme-core-api/payments-service)",
  "commit_sha": "string",
  "pr_number": "integer (optional)",
  "started_at": "ISO 8601 timestamp",
  "completed_at": "ISO 8601 timestamp",
  "trigger_type": "string (push | merge | manual | schedule)",
  "artefact_version": "string (optional)",
  "failure_reason": "string (optional, on failure)"
}
```

**Incident Event Payload:**

```json
{
  "incident_id": "string (monitoring system identifier)",
  "event_type": "string (alarm_triggered | alarm_resolved | incident_opened | incident_resolved)",
  "service_name": "string (mapped to tech_stream via repo registry deploy_target)",
  "severity": "string (critical | high | medium | low)",
  "description": "string",
  "occurred_at": "ISO 8601 timestamp"
}
```

#### 5.4.3 Technology Stream Derivation

For deployment events: `repo_full_name` is looked up in the `repositories` table, which references `tech_stream_id`.

For incident events: `service_name` is matched against the `deploy_target` field in the `repositories` table to resolve the technology stream.

#### 5.4.4 Deployment → Incident Correlation

When a deployment event is received for a production environment, the platform records it and watches for incident events within a configurable correlation window (default: 60 minutes). If an incident is raised for the same technology stream within this window, the deployment is linked to the incident via `deployment_records.caused_incident` and `deployment_records.incident_id`.

This correlation drives the Change Failure Rate metric.

### 5.5 Pulse Survey Integration

#### 5.5.1 Collection Method

The pulse survey is a lightweight, anonymous form presented to team members monthly. The platform may either host the form directly or integrate with an external form tool.

**Built-in Survey:**

- The platform presents a 3-question survey form to authenticated users.
- The form is available for a configurable window each month (e.g. 1st–7th).
- Responses are anonymised at write time using the same HMAC process described in §4.6.
- The `respondent_hash` allows the platform to track that the same individual's score changed month-to-month, without knowing who they are.

**External Survey Integration:**

- An external tool (e.g. Google Forms, Typeform) collects responses.
- A scheduled job or webhook pushes aggregated results to the `pulse_responses` table via the event ingestion API.
- External integration must ensure anonymisation before data reaches the platform.

#### 5.5.2 Survey Questions

The survey consists of exactly three questions, each scored on a 1–5 Likert scale:

| Question | Field | What it Measures |
|---|---|---|
| "How sustainable does the current pace of work feel?" | pace_score | Burnout risk, over-commitment |
| "How much do your tools and processes help (vs hinder) your work?" | tooling_score | Tooling friction, process overhead |
| "How clear are the current priorities and what you should be working on?" | clarity_score | Alignment, communication, requirements quality |

The free-text field is optional and is stored but never displayed on dashboards. It is intended for use in team retrospectives only.

### 5.6 Data Quality and Triage

Events that cannot be fully enriched (missing delivery stream, missing ticket link, unknown tech stream) are not discarded. They are stored with `NULL` values for the unresolvable fields and flagged in a data quality tracking mechanism.

The platform computes and displays the following data quality metrics:

| Metric | Computation | Target |
|---|---|---|
| PR ticket linkage rate | PRs with non-null `linked_ticket_id` / total PRs | ≥ 90% |
| Ticket stream tagging rate | Work items with non-null `delivery_stream_id` / total work items | ≥ 95% |
| Defect origin attribution rate | Defects with non-null `introduced_in_stage` / total defects | ≥ 70% |
| Pulse survey response rate | Responses / team size per delivery stream | ≥ 60% |
| Deployment traceability rate | Deployments with non-null `linked_ticket_id` / total production deployments | ≥ 80% |

These metrics should be displayed on the platform's admin dashboard and treated as prerequisites for metric accuracy. Low data quality rates should trigger alerts and process improvements, not workarounds.

**Dashboard Confidence Warnings:** When data quality for a given stream falls below the target threshold, the dashboard must display a visual warning on all affected metrics for that stream. For example, if PR ticket linkage rate for a technology stream drops below 90%, the Lead Time and DORA metrics for that stream should display a "reduced confidence" indicator with the current linkage rate. This prevents stakeholders from making decisions based on metrics that are computed from incomplete data, and creates visible pressure to improve data hygiene.

---

## 6. Metric Computation Specifications

### 6.1 Overview

Each metric is computed from one or more event tables and materialised into the `daily_stream_metrics` table and/or the specialised computed tables. Metrics are categorised by their dashboard zone and refresh frequency.

All window-based metrics (rolling averages, percentiles) use a configurable rolling window. The default is 30 calendar days unless otherwise specified. All business-day calculations exclude weekends and should support a configurable list of public holidays.

### 6.2 Real-Time Metrics

#### 6.2.1 WIP by Stage

| Property | Value |
|---|---|
| Metric Name | `wip_by_stage` |
| Dashboard Zone | Real-Time |
| Framework | SPACE (Efficiency) |
| Refresh | Event-driven (on each `work_item_events.transitioned`) |

**Computation:**

For each pipeline stage, count the number of work items currently in that stage. A work item is "in" a stage if its most recent transition event has `to_stage = {stage}` and there is no subsequent transition event for that ticket.

```
For each (delivery_stream, pipeline_stage):
  COUNT(DISTINCT ticket_id)
  WHERE ticket_id's latest work_item_event has to_stage = pipeline_stage
  AND ticket_id has no work_item_event with event_type = 'completed'
```

**Outputs:** Per delivery stream and per technology stream, a count per pipeline stage.

**Behavioural Intent:** Makes bottleneck accumulation visible. When QA has significantly more items than DEV, the team should swarm on testing rather than starting new development work.

#### 6.2.2 Sprint Delivery Confidence

| Property | Value |
|---|---|
| Metric Name | `sprint_confidence` |
| Dashboard Zone | Real-Time |
| Framework | OKR (Predictability) |
| Refresh | Every 2 hours during an active sprint |

**Computation:**

1. From the latest `sprint_snapshot` for the active sprint, determine `remaining_count`.
2. Determine the number of working days remaining in the sprint.
3. From `work_item_cycles` for the same delivery stream, sample the daily throughput (items completed per day) from the trailing 6 sprints.
4. Run a Monte Carlo simulation (1,000 iterations): for each remaining day, sample a daily throughput from the historical distribution. Sum the sampled throughputs across remaining days.
5. Confidence = percentage of simulations where total sampled throughput ≥ `remaining_count`.

**Outputs:** A percentage (0–100) per delivery stream for the active sprint.

**Behavioural Intent:** Provides early warning when a sprint commitment is at risk, forcing scope-cut conversations mid-sprint rather than at the end.

#### 6.2.3 Cycle Time Distribution

| Property | Value |
|---|---|
| Metric Name | `cycle_time_p50`, `cycle_time_p85`, `cycle_time_p95` |
| Dashboard Zone | Real-Time |
| Framework | DORA (Lead Time proxy) |
| Refresh | On each `work_item_events.completed` |

**Computation:**

From `work_item_cycles` within the rolling window (default 30 days), compute the 50th, 85th, and 95th percentiles of `cycle_time_days`.

The scatter plot view uses individual `work_item_cycles` records, plotting `completed_at` on the x-axis and `cycle_time_days` on the y-axis, with the p85 line as a reference.

**Outputs:** Three percentile values per delivery stream and per technology stream.

**Behavioural Intent:** Makes outliers visible. Items significantly above the p85 line prompt investigation into what is blocking them. Over time, encourages teams to break work into smaller slices.

### 6.3 Diagnostic Metrics

#### 6.3.1 Flow Efficiency

| Property | Value |
|---|---|
| Metric Name | `flow_efficiency` |
| Dashboard Zone | Diagnostic |
| Framework | SPACE (Efficiency) |
| Refresh | Daily |

**Computation:**

From `work_item_cycles` within the rolling window:

```
flow_efficiency = AVG(active_time_days / cycle_time_days × 100)
```

Where `active_time_days` is the sum of time spent in pipeline stages marked `is_active_work = TRUE` in the `status_mappings` table, and `cycle_time_days` is the total elapsed time from first in-progress to done.

Additionally, compute the average wait time per queue stage to identify which handoff points are slowest:

```
For each queue stage (is_active_work = FALSE):
  AVG(stage_durations->{stage}) across completed work items
```

**Outputs:** Overall flow efficiency percentage and per-stage average duration, per delivery stream.

**Behavioural Intent:** Shifts focus from "work faster" (active time) to "wait less" (queue time). Typical teams discover 15–20% flow efficiency, meaning items spend 80–85% of their lifecycle waiting. The per-stage breakdown identifies which handoff to improve first.

#### 6.3.2 Defect Escape Rate

| Property | Value |
|---|---|
| Metric Name | `defect_escape_rate` |
| Dashboard Zone | Diagnostic |
| Framework | SPACE (Performance) |
| Refresh | Daily |

**Computation:**

From `defect_events` within the rolling window, first resolve each defect to its current attribution by selecting the latest event per `ticket_id` (by `event_timestamp`). Then:

```
escape_rate = COUNT(found_in_stage IN ('uat', 'production')) / COUNT(*) × 100
```

Additionally, compute a stage-pair matrix for the sankey visualisation:

```
For each (introduced_in_stage, found_in_stage) pair:
  COUNT(defects) using latest attribution per ticket
  (excluding records where introduced_in_stage IS NULL)
```

Report the percentage of defects with `introduced_in_stage IS NULL` (i.e. unattributed defects — those with only a `logged` event and no subsequent `attributed` event) as a data quality metric.

**Outputs:** Escape rate percentage and stage-pair matrix, per delivery stream and per technology stream.

**Behavioural Intent:** Identifies where quality is escaping. A high rate of defects introduced in BA but found in UAT suggests requirements gaps. A high rate of defects introduced in DEV but found in production suggests inadequate QA coverage.

#### 6.3.3 PR Review Turnaround

| Property | Value |
|---|---|
| Metric Name | `review_turnaround_p50`, `review_turnaround_p85` |
| Dashboard Zone | Diagnostic |
| Framework | SPACE (Communication) |
| Refresh | On each `pr_events.review_submitted` |

**Computation:**

From `pr_cycles` within the rolling window:

```
Percentiles of time_to_first_review_hrs (p50, p85)
```

Additionally, compute reviewer concentration:

```
For each reviewer_hash:
  COUNT(reviews) / total_reviews × 100
Flag if any single reviewer handles > 50% of reviews within a tech stream.
```

**Outputs:** Review turnaround percentiles and reviewer concentration metrics, per technology stream.

**Behavioural Intent:** Exposes the largest hidden wait state in most teams (PR review queues). Also surfaces knowledge silos — if one person reviews most PRs, that is a bus-factor risk.

### 6.4 Trend Metrics (DORA)

#### 6.4.1 Deployment Frequency

| Property | Value |
|---|---|
| Metric Name | `deployment_frequency` |
| Dashboard Zone | Trend |
| Framework | DORA |
| Refresh | On each `cicd_events.deploy_completed` |

**Computation:**

```
COUNT(deployment_records WHERE environment = 'production' AND status = 'success')
/ number_of_calendar_days_in_window
× 7  (to normalise to per-week)
```

Only count deployments to production that represent meaningful changes. Exclude deployments flagged as configuration-only if a mechanism to tag them exists.

**Outputs:** Deployments per week, per technology stream and per delivery stream. Rolling 4-week trend.

**Behavioural Intent:** Encourages smaller, more frequent releases. A declining trend signals growing batch sizes or process friction.

#### 6.4.2 Change Failure Rate

| Property | Value |
|---|---|
| Metric Name | `change_failure_rate` |
| Dashboard Zone | Trend |
| Framework | DORA |
| Refresh | On each deployment or incident event |

**Computation:**

```
COUNT(deployment_records WHERE environment = 'production' AND (status = 'rolled_back' OR caused_incident = TRUE))
/ COUNT(deployment_records WHERE environment = 'production')
× 100
```

**Outputs:** Percentage, per technology stream. Rolling 30-day trend.

**Behavioural Intent:** Balances deployment frequency. Without this metric, teams could deploy frequently with poor quality. Together with deployment frequency, it drives the right behaviour: deploy often AND deploy safely.

#### 6.4.3 Time to Restore (TTR)

| Property | Value |
|---|---|
| Metric Name | `ttr_median` |
| Dashboard Zone | Trend |
| Framework | DORA |
| Refresh | On each incident resolution |

**Computation:**

```
MEDIAN(incident_events.time_to_restore_min)
  WHERE event_type = 'alarm_resolved' OR event_type = 'incident_resolved'
  within rolling window
```

**Note on nomenclature:** DORA defines this metric as "Mean Time to Restore" (MTTR). This platform computes the **median** rather than the mean because restore-time distributions are typically right-skewed — a single multi-hour outage can distort the mean and mask genuine improvement. The dashboard displays this as "Time to Restore (median)" with the p50 value. The mean is also computed and available via the API as `ttr_mean` for stakeholders who require strict DORA-standard reporting.

**Outputs:** Median time to restore in minutes, per technology stream. Rolling 30-day trend.

**Behavioural Intent:** Measures recovery capability. In combination with change failure rate, teams can assess whether they are improving at both preventing and recovering from failures.

### 6.4a Lead Time for Changes (DORA)

#### 6.4.4 Lead Time for Changes

| Property | Value |
|---|---|
| Metric Name | `lead_time_p50`, `lead_time_p85` |
| Dashboard Zone | Trend |
| Framework | DORA |
| Refresh | On each production deployment event |

**Computation:**

The platform supports two lead time calculation methods, in order of preference:

1. **PR-based (default):** PR opened (`pr_events.opened.event_timestamp`) → production deploy (`cicd_events.deploy_completed.event_timestamp`). This uses data already available from webhooks with no additional API calls. It slightly underestimates true lead time (excludes local development time before the PR is opened) but is reliable and low-cost to compute.

2. **Commit-based (optional, requires push webhook):** First push event to the feature branch → production deploy. This requires the `push` webhook event to be enabled in the GitHub App, which increases event volume. It should not be computed by walking Git history via the API, as this would violate the minimal-outbound-calls principle.

The method is configurable per technology stream. The default is PR-based. From `deployment_records.lead_time_hrs` within the rolling window, compute the 50th and 85th percentiles.

**Outputs:** Two percentile values per technology stream. Rolling 30-day trend.

**Behavioural Intent:** Measures the full pipeline friction from "developer starts working" to "change is in users' hands." Complements deployment frequency — a team can deploy daily but if each deployment carries 3 weeks of lead time, the feedback loop is still slow.

### 6.5 Forecast Metrics

#### 6.5.1 Monte Carlo Delivery Forecast

| Property | Value |
|---|---|
| Metric Name | `monte_carlo_forecast` |
| Dashboard Zone | Forecast |
| Framework | OKR (Predictability) |
| Refresh | Daily |

**Computation:**

1. Determine the remaining scope: count of work items in the delivery stream's backlog, BA, DEV, QA, and UAT stages.
2. From `work_item_cycles`, extract the weekly throughput (items completed per week) for the trailing 12 weeks for the same delivery stream.
3. Run 10,000 simulations: for each simulation, sample a random weekly throughput from the historical distribution for each future week until cumulative throughput ≥ remaining scope. Record the completion week.
4. From the 10,000 simulated completion dates, compute the p50, p70, p85, and p95 dates.

**Minimum data requirement:** At least 6 weeks of throughput history. If insufficient data exists, the full Monte Carlo forecast is suppressed and replaced with a **simple linear projection**: remaining scope ÷ average weekly throughput over available weeks = estimated weeks to completion. This projection is displayed with a prominent "low-confidence" label and a note indicating how many more weeks of data are needed before the probabilistic forecast becomes available. The linear projection should not display confidence intervals, as there is insufficient data to compute them meaningfully.

**Outputs:** p50, p70, p85, p95 completion dates and a probability distribution histogram, per delivery stream.

**Behavioural Intent:** Replaces false-precision estimates ("it will be done on March 15") with honest probability ranges ("70% chance by March 15, 90% chance by March 28"). Forces stakeholders to engage with uncertainty and make scope prioritisation decisions based on probabilistic outcomes.

### 6.6 Team Health Metric

#### 6.6.1 Team Health Pulse

| Property | Value |
|---|---|
| Metric Name | `team_pulse` |
| Dashboard Zone | Health |
| Framework | SPACE (Satisfaction) |
| Refresh | Monthly (on survey close) |

**Computation:**

From `pulse_responses` for the current survey period:

```
For each dimension (pace, tooling, clarity):
  AVG(score) per delivery_stream
  TREND = current_avg - previous_period_avg
```

Also compute:

```
response_rate = COUNT(responses) / team_size × 100
overall_avg = (pace_avg + tooling_avg + clarity_avg) / 3
```

**Outputs:** Three dimension scores, trends, response rate, and overall score, per delivery stream.

**Behavioural Intent:** The leading indicator that all other metrics lag behind. Declining satisfaction predicts rising cycle times, increasing defects, and attrition — often weeks before the quantitative metrics show it. The platform must ensure that survey results lead to visible action; otherwise participation will decline.

### 6.7 Cross-Stream Correlation

| Property | Value |
|---|---|
| Metric Name | `cross_stream_bottleneck` |
| Dashboard Zone | Diagnostic (Cross-Stream) |
| Framework | SPACE (Efficiency) |
| Refresh | Hourly |

**Computation:**

For each technology stream:

1. Count `work_item_events` with `event_type = 'blocked'` and `blocking_tech_stream_id` referencing this tech stream, within a rolling 14-day window.
2. Identify the distinct `delivery_stream_id` values affected.
3. Compute the average sprint confidence and p85 cycle time across affected delivery streams.
4. Assign a severity based on the number of impacted delivery streams and the magnitude of impact. The following thresholds are defaults and must be configurable via the platform admin settings without code changes:

| Impacted Streams | Average Confidence | Severity |
|---|---|---|
| 0 | Any | `none` |
| 1 | ≥ 70% | `low` |
| 1 | < 70% | `medium` |
| 2+ | ≥ 70% | `medium` |
| 2+ | < 70% | `high` |
| 3+ | < 60% | `critical` |

These thresholds should be reviewed and tuned after the first 4–6 weeks of production data. Initial deployment should log severity assessments without triggering alerts, allowing the team to calibrate before enabling notifications.

**Outputs:** Per technology stream: impacted delivery streams, block count, average confidence, severity. Stored in `cross_stream_correlations`.

**Behavioural Intent:** Prevents delivery teams from being blamed for delays caused by shared infrastructure instability. When multiple delivery streams are impacted by the same technology dependency, the conversation shifts from "why is your team slow?" to "we need to invest in improving this shared system."

---

## 7. Dashboard and API Specification

### 7.1 Dashboard Structure

The dashboard is a web application served by the platform. It is organised into the following views:

#### 7.1.1 Primary Dashboard

The default view, showing metrics for a selected delivery stream (or all streams aggregated).

**Layout Zones:**

| Zone | Position | Contents | Refresh |
|---|---|---|---|
| Stream Health Bar | Top | Summary metrics for selected stream: confidence, cycle time p85, flow efficiency, deploy frequency, CFR, defect escape rate | Real-time |
| Real-Time Signals | Upper | WIP by Stage, Sprint Confidence Gauge, Cycle Time Scatter | Real-time |
| Diagnostic Views | Middle | Flow Efficiency, Defect Escape Rate, PR Review Turnaround | Daily |
| Trend Views | Lower-middle | Deployment Frequency Trend, Change Failure Rate Trend, Time to Restore Trend | On event |
| Forecast | Lower | Monte Carlo Delivery Forecast | Daily |
| Team Health | Bottom | Pulse Survey Results | Monthly |

#### 7.1.2 Cross-Stream View

A dedicated view for identifying shared technology bottlenecks.

**Contents:**

- Technology Dependency Heatmap: matrix of technology streams × delivery streams, with dependency indicators and blocking alerts.
- Per-technology-stream impact analysis when a specific tech stream is selected.
- Root-cause signal: automated identification of the technology stream with the highest cross-stream impact.

#### 7.1.3 Admin View

Platform administration, accessible to `platform_admin` role only.

**Contents:**

- Data quality metrics (§5.6)
- Stream configuration management (delivery streams, technology streams)
- User and API key management
- Integration health monitoring (webhook delivery rates, API usage, error rates)
- Status mapping configuration

### 7.2 Filtering

All dashboard views support the following filters:

| Filter | Type | Behaviour |
|---|---|---|
| Delivery Stream | Single-select dropdown (with "All" option) | Filters all metrics to the selected delivery stream. "All" aggregates across streams. |
| Technology Stream | Single-select dropdown (with "All" option) | Filters to metrics related to the selected technology stream. Activates cross-stream correlation view when a specific tech stream is selected. |
| Time Range | Preset options (sprint, 30d, 90d, custom) | Adjusts the rolling window for trend and diagnostic metrics. Does not affect real-time metrics. |
| Metric Zone | Multi-select toggle | Shows/hides dashboard zones (Real-Time, Diagnostic, Trend, Forecast, Health). |

Filters are persisted in the URL query string, allowing users to bookmark and share specific views.

### 7.3 API Specification

The platform exposes a REST API for dashboard consumption and external integration.

#### 7.3.1 API Versioning

All endpoints are prefixed with `/api/v1/`. Breaking changes require a new version prefix.

#### 7.3.2 Core Endpoints

**Configuration:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/streams/delivery` | List delivery streams |
| GET | `/api/v1/streams/tech` | List technology streams |
| GET | `/api/v1/sprints?stream={id}&state={state}` | List sprints |

**Metrics:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/metrics/realtime?stream={id}` | Current WIP, confidence, cycle time scatter data |
| GET | `/api/v1/metrics/diagnostic?stream={id}&window={days}` | Flow efficiency, defect escape, review turnaround |
| GET | `/api/v1/metrics/trends?stream={id}&window={days}` | DORA metrics time series |
| GET | `/api/v1/metrics/forecast?stream={id}` | Monte Carlo forecast results |
| GET | `/api/v1/metrics/pulse?stream={id}&periods={n}` | Pulse survey aggregates |
| GET | `/api/v1/metrics/cross-stream?tech_stream={id}` | Cross-stream correlation data |

**Event Ingestion (for external systems):**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/events/deployment` | Push deployment events |
| POST | `/api/v1/events/incident` | Push incident events |

**Administration:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/admin/data-quality` | Data quality metrics |
| GET | `/api/v1/admin/integration-health` | Integration status and error rates |
| POST | `/api/v1/admin/backfill/{source}/{org}` | Trigger historical backfill |

#### 7.3.3 Response Format

All API responses use JSON with a consistent envelope:

```json
{
  "status": "ok",
  "data": { },
  "meta": {
    "stream_type": "delivery",
    "stream_id": "uuid",
    "window_days": 30,
    "computed_at": "ISO 8601 timestamp"
  }
}
```

Error responses:

```json
{
  "status": "error",
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

#### 7.3.4 Caching Strategy

Dashboard API responses should be cached at the API layer to avoid repeated metric computation.

| Endpoint Category | Cache TTL | Invalidation |
|---|---|---|
| Real-time metrics | 30 seconds | On relevant event ingestion |
| Diagnostic metrics | 15 minutes | On daily recomputation |
| Trend metrics | 5 minutes | On relevant event ingestion |
| Forecast | 1 hour | On daily recomputation |
| Pulse survey | 24 hours | On monthly aggregation |
| Configuration | 5 minutes | On configuration change |

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Requirement | Target |
|---|---|
| Dashboard initial load time | < 3 seconds (cached data), < 8 seconds (cold) |
| Webhook event processing latency | < 5 seconds from receipt to event store write |
| API response time (cached) | < 200ms (p95) |
| API response time (uncached) | < 2 seconds (p95) |
| Monte Carlo simulation | < 30 seconds for 10,000 iterations |
| Concurrent dashboard users | Support at least 50 simultaneous users |

### 8.2 Availability

| Requirement | Target |
|---|---|
| Platform availability | 99.5% during business hours (08:00–20:00 local) |
| Planned maintenance | Performed outside business hours with 48hr notice |
| Event ingestion | Designed for eventual consistency; brief outages acceptable if events are buffered and reprocessed. No event loss. |

### 8.3 Data Retention

| Data Type | Retention Period |
|---|---|
| Raw events | 24 months minimum |
| Computed daily metrics | 36 months minimum |
| Work item cycle data | 36 months minimum |
| PR cycle data | 24 months minimum |
| Deployment records | 24 months minimum |
| Forecast snapshots | 12 months minimum |
| Pulse survey aggregates | Indefinite |
| Pulse survey raw responses | 12 months, then deleted |
| Archived event log (file-based) | Indefinite (long-term storage tier) |

### 8.4 Security

| Requirement | Detail |
|---|---|
| Transport | All communication over TLS 1.2+ |
| Authentication | See §3 — OIDC (production), database auth (non-production), API keys (service-to-service) |
| Authorisation | RBAC with stream-level scoping (§3.3) |
| Secrets | Stored in a dedicated secrets management service, never in configuration files, environment variables, or source code |
| Webhook verification | All GitHub webhooks verified via HMAC-SHA256 signature |
| API key storage | Hashed with a one-way function, never stored in plain text |
| Anonymisation | Individual identifiers hashed with HMAC-SHA256 (§4.6) |
| Audit log | Authentication events, configuration changes, and API key usage logged with timestamp and actor |
| Database | Encrypted at rest. Access restricted to platform service accounts. No direct user access. |

### 8.5 Monitoring and Alerting

The platform must monitor its own health and alert on the following conditions:

| Condition | Severity | Action |
|---|---|---|
| Webhook ingestion failure rate > 5% over 15 minutes | High | Investigate integration health |
| Event processing queue depth > 1000 | Medium | Scale processing capacity |
| Metric computation failure | High | Rerun computation, investigate data |
| API response time p95 > 5 seconds | Medium | Investigate performance |
| Data quality metric below target (§5.6) | Low | Notify platform admin |
| Pulse survey response rate < 40% | Low | Remind team leads |
| GitHub API rate limit remaining < 200 for any org | Medium | Defer non-critical API calls |
| Database connection pool exhaustion | Critical | Immediate investigation |

### 8.6 Disaster Recovery

| Requirement | Approach |
|---|---|
| Event durability | All raw events written to both the relational database and an immutable file-based archive. The file archive serves as the disaster recovery source. |
| Metric recomputation | All computed metric tables can be dropped and rebuilt from the event tables. Recomputation may take several hours for a full rebuild. |
| Database backup | Automated daily backups with point-in-time recovery capability. Retention: 30 days. |
| Recovery time objective (RTO) | 4 hours during business hours |
| Recovery point objective (RPO) | 1 hour (no more than 1 hour of events lost in worst case) |

---

## 9. Implementation Phases

### Phase 1: Foundation (Weeks 1–3)

**Objective:** Establish the data model, authentication, and Jira integration. Deliver the first usable metrics.

**Deliverables:**

- Database schema (configuration and event tables)
- Authentication layer (database auth for development, OIDC integration for staging/production)
- Jira webhook receiver and event normaliser
- Status mapping configuration UI
- Delivery stream and technology stream configuration
- Sprint snapshot poller
- Work item cycle computation
- Dashboard: WIP by Stage, Cycle Time Distribution, Flow Efficiency
- API: Real-time and diagnostic metric endpoints

**Exit Criteria:**

- Work item transition events flowing from Jira to the event store
- WIP by stage visible on dashboard filtered by delivery stream
- Cycle time scatter plot rendering with p85 line
- Flow efficiency computed and displayed

### Phase 2: GitHub Integration (Weeks 4–5)

**Objective:** Integrate GitHub across all organisations. Deliver developer experience metrics.

**Deliverables:**

- GitHub App registration, installation across all orgs
- Webhook receiver with multi-org routing and signature verification
- PR event normalisation and cycle computation
- Branch name → ticket linking
- Historical backfill for existing PRs (per-org, rate-limit aware)
- Dashboard: PR Review Turnaround, reviewer concentration
- Partial DORA Lead Time (PR merge → inferred deploy)

**Exit Criteria:**

- PR events flowing from all GitHub orgs
- PR review turnaround p85 visible per technology stream
- ≥ 80% PR-to-ticket linkage rate
- Reviewer concentration analysis available

### Phase 3: Deployment and DORA (Weeks 6–7)

**Objective:** Complete DORA metric coverage with deployment and incident data.

**Deliverables:**

- Event ingestion API for deployment and incident events
- API key management (creation, rotation, scoping)
- Deployment record computation (linking deploy → PR → ticket)
- Incident event processing and deploy-incident correlation
- Dashboard: Deployment Frequency trend, Change Failure Rate trend, Time to Restore
- Full DORA Lead Time for Changes (PR-based default — see §6.4.4)

**Exit Criteria:**

- All four DORA metrics computed and displayed
- Deployment events linked to source PRs and work items
- Change failure rate reflecting incident correlation

### Phase 4: Forecasting and Cross-Stream Intelligence (Weeks 8–10)

**Objective:** Deliver Monte Carlo forecasting, cross-stream correlation, and pulse surveys.

**Deliverables:**

- Monte Carlo simulation engine
- Cross-stream correlation computation and alerting
- Cross-Stream View on dashboard (dependency heatmap, impact analysis)
- Pulse survey form (built-in) or external integration
- Pulse survey aggregation
- Sprint confidence computation
- Dashboard: Forecast view, Sprint Confidence gauge, Team Health Pulse, Cross-Stream View
- Admin dashboard: data quality metrics, integration health

**Exit Criteria:**

- Monte Carlo forecast rendering for delivery streams with ≥ 6 weeks of throughput data
- Cross-stream bottleneck detection identifying shared tech-stream impacts
- Pulse survey collecting responses and displaying aggregated results
- Data quality metrics visible on admin dashboard

### Phase 5: Hardening and Rollout (Weeks 11–12)

**Objective:** Production readiness, performance optimisation, documentation, and team onboarding.

**Deliverables:**

- Performance testing and optimisation (caching, query tuning)
- OIDC integration testing with production Entra ID tenant
- Entra ID group → role mapping configuration
- Monitoring and alerting implementation
- Runbook documentation for operations
- User documentation for team leads and dashboard consumers
- Onboarding sessions with delivery stream leads
- Data quality baseline assessment and improvement plan

**Exit Criteria:**

- Platform accessible via SSO in production
- Dashboard load time < 3 seconds (cached)
- All monitoring alerts configured and tested
- At least one sprint of data flowing through the complete pipeline
- Team leads trained on dashboard interpretation and intended behaviours

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Jira workflow inconsistency across projects | High | Medium | The status_mappings table accommodates per-project mapping. Conduct a Jira workflow audit in Phase 1 to identify all status names in use. |
| Low adoption of Jira custom fields (delivery_stream, tech_stream) | Medium | High | Provide fallback derivation methods (§5.2.4). Track tagging rate as a data quality metric. Consider making fields required in Jira workflows. |
| Branch naming convention not followed | Medium | Medium | Track PR linkage rate (§5.6). Provide a pre-commit hook or CI check that validates branch names. Non-linked PRs are still stored but reduce metric accuracy. |
| GitHub API rate limits during backfill | Medium | Low | Backfill runs off-peak, one org at a time, with rate-limit awareness (§5.3.7). GraphQL API reduces call count. |
| Metric gaming (e.g. inflating deployment count) | Low | High | Combine metrics that balance each other (deployment frequency + change failure rate). Use the platform to drive conversations, not incentive structures. Display activity metrics as context, never as targets. |
| Pulse survey fatigue / declining participation | Medium | Medium | Limit to 3 questions. Keep the survey window short. Ensure visible action results from survey findings. Track and display response rate. |
| Cross-stream correlation producing false positives | Medium | Low | Use configurable thresholds for severity assignment. Present correlations as signals to investigate, not as definitive diagnoses. |
| Entra ID group structure doesn't map cleanly to platform roles | Low | Medium | Provide a flexible group → role mapping table. Support regex matching on group names. Allow manual role assignment as an override. |

---

## 11. Glossary

| Term | Definition |
|---|---|
| DORA | DevOps Research and Assessment — the four key metrics of software delivery performance. |
| SPACE | Satisfaction, Performance, Activity, Communication, Efficiency — a framework for developer productivity. |
| OKR | Objectives and Key Results — a goal-setting framework. |
| Monte Carlo Simulation | A statistical technique that uses repeated random sampling from historical distributions to model probabilistic outcomes. |
| Flow Efficiency | The ratio of active work time to total elapsed time for a work item. |
| Cycle Time | The elapsed time from when work begins on an item (first transition to an active stage) to completion. |
| Lead Time | The elapsed time from when a change is initiated (PR opened, or first commit if configured) to when it is deployed to production. See §6.4.4 for computation methods. |
| WIP | Work In Progress — the count of items currently in active pipeline stages. |
| p85 | The 85th percentile of a distribution — "85% of items are at or below this value." |
| CFR | Change Failure Rate — the percentage of deployments that cause failures. |
| TTR | Time to Restore — the time to recover from a production failure. This platform reports the median (p50) as the primary value. DORA's standard definition uses the mean; both are computed and available. |
| Bus Factor | The number of team members who would need to be unavailable before a team loses critical knowledge. |
| HMAC | Hash-based Message Authentication Code — used for webhook verification and identity anonymisation. |

---

## 12. Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-02-18 | Technical Product Owner | Initial specification |
| 1.1 | 2026-02-18 | Technical Product Owner | Revised per review feedback: per-table idempotency constraints (replacing shared external_id); append-only defect attribution model; TTR nomenclature (median vs mean); small-team anonymisation safeguard; PR linking fallback chain; Monte Carlo low-data fallback; configurable cross-stream severity thresholds; lead time computation method clarification; stateless API key auth; dashboard data confidence warnings |

---

## 13. Appendices

### Appendix A: Jira Custom Field Recommendations

The following custom fields are recommended for Jira tickets to support the platform's data model:

| Field Name | Type | Required | Purpose |
|---|---|---|---|
| Delivery Stream | Single-select dropdown | Yes (workflow enforced) | Primary stream attribution for work items |
| Technology Streams | Multi-select checkboxes | Recommended | Tech stream attribution — especially for cross-cutting work |
| Found In Stage | Single-select dropdown (on Bug type) | Yes for bugs | Stage where defect was discovered |
| Introduced In Stage | Single-select dropdown (on Bug type) | Recommended for bugs | Stage where defect is believed to have originated |
| Blocking Technology | Single-select dropdown | When flagged/blocked | Which tech stream is causing the block |

### Appendix B: Branch Naming Convention

All branches that should be linked to Jira tickets must follow this pattern:

```
{prefix}/{JIRA-KEY}-{description}
```

Where:

- `{prefix}` is one of: `feature`, `bugfix`, `hotfix`, `chore`, `spike` (optional but recommended)
- `{JIRA-KEY}` is the Jira issue key (e.g. `PAY-456`, `AUTH-78`)
- `{description}` is a kebab-case description (e.g. `add-retry-logic`)

**Examples:**

```
feature/PAY-456-add-retry-logic
bugfix/AUTH-78-fix-token-expiry
PAY-456-add-retry-logic          (prefix optional)
hotfix/CORE-901-null-check
```

### Appendix C: Example Status Mapping

| Jira Project | Jira Status | Pipeline Stage | Is Active Work |
|---|---|---|---|
| PAY | To Do | backlog | No |
| PAY | In Analysis | ba | Yes |
| PAY | Ready for Dev | dev (queue) | No |
| PAY | In Development | dev | Yes |
| PAY | In Code Review | code_review | Yes |
| PAY | Ready for QA | qa (queue) | No |
| PAY | In QA | qa | Yes |
| PAY | Ready for UAT | uat (queue) | No |
| PAY | In UAT | uat | Yes |
| PAY | Done | done | N/A |

Note: The distinction between active and queue sub-states within a stage is what enables flow efficiency computation. Without this mapping, the platform cannot distinguish work time from wait time.
