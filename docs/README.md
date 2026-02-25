# Documentation — Delivery Performance Platform

## For operators and administrators

| Document | Description |
|---|---|
| [Setup Guide](setup-guide.md) | Prerequisites, installation, demo seed data, webhook setup |
| [Configuration Reference](configuration-reference.md) | All environment variables, platform settings, scheduled commands |
| [Runbook](runbook.md) | Production operations: deployment, backup, data retention, troubleshooting |
| [Admin Guide](admin-guide.md) | Admin console reference: streams, API keys, users, OIDC, backfill |

### Quick start (local demo)

```bash
git clone <repo> && cd delivery-productivity
npm install
cp .env.example .env  # set DB_* and APP_KEY (node ace generate:key)
node ace migration:run
NODE_ENV=development node ace db:seed
node ace serve --hmr
# → open http://localhost:3333 and log in as admin@demo.local / Demo1234!
```

## For developers and integrators

| Document | Description |
|---|---|
| [API Reference](api-reference.md) | All REST endpoints: authentication, webhooks, metrics, events |

## For end users

| Document | Description |
|---|---|
| [User Guide](user-guide.md) | Dashboard zones, metric definitions, pulse survey, forecasting |
