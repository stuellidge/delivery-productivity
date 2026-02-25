# Setup Guide — Delivery Performance Platform

This guide walks you through installing and running the Delivery Performance Platform (DPP) from scratch.

---

## Prerequisites

| Requirement | Version         | Notes                                                  |
| ----------- | --------------- | ------------------------------------------------------ |
| Node.js     | 20 LTS or later | Use `nvm` or `fnm` to manage versions                  |
| PostgreSQL  | 14 or later     | Local install or managed service (RDS, Supabase, etc.) |
| npm         | 10+             | Bundled with Node.js                                   |
| Git         | any             | For cloning the repository                             |

Optional integrations (configured later):

- A Jira Cloud account with webhook permissions
- A GitHub organisation with admin access (for webhooks / GitHub App)
- A Microsoft Entra ID tenant (for OIDC login)
- A Slack incoming webhook URL (for alert notifications)

---

## 1. Clone and install

```bash
git clone <repository-url> delivery-productivity
cd delivery-productivity
npm install
```

---

## 2. Create the database

```bash
# Connect to PostgreSQL as a superuser
psql -U postgres

# Create the database and a dedicated user
CREATE DATABASE delivery_productivity;
CREATE USER dpp WITH PASSWORD 'changeme';
GRANT ALL PRIVILEGES ON DATABASE delivery_productivity TO dpp;

# Grant schema privileges (PostgreSQL 15+)
\c delivery_productivity
GRANT ALL ON SCHEMA public TO dpp;
\q
```

---

## 3. Configure environment variables

Copy the example file and edit it:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
NODE_ENV=development
PORT=3333
HOST=0.0.0.0
LOG_LEVEL=info
SESSION_DRIVER=cookie

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=dpp
DB_PASSWORD=changeme
DB_DATABASE=delivery_productivity
```

### Generate the application encryption key

```bash
node ace generate:key
```

Copy the output and paste it into `.env`:

```env
APP_KEY=base64:GENERATED_KEY_HERE
```

> Keep `APP_KEY` secret and never rotate it without migrating session tokens first.

---

## 4. Run database migrations

```bash
node ace migration:run
```

You should see all migrations applied successfully. If you see an error, check that the DB credentials in `.env` are correct and the database exists.

---

## 5. Load demo data (development / local demo)

The platform ships with a comprehensive set of demo seed data covering two teams (Payments and Search), 90 days of deployment history, sprint data, pulse surveys, and pre-computed DORA metrics.

```bash
NODE_ENV=development node ace db:seed
```

This command:

- Creates 3 demo user accounts (see credentials below)
- Configures delivery streams, tech streams, and repositories
- Seeds 90 days of work items, PRs, deployments, incidents, and pulse data
- Pre-populates daily DORA metrics so trend charts are populated immediately

**Demo login credentials:**

| Email              | Password    | Role                                            |
| ------------------ | ----------- | ----------------------------------------------- |
| `admin@demo.local` | `Demo1234!` | Platform Admin — full access to all admin pages |
| `alice@demo.local` | `Demo1234!` | Viewer — scoped to Payments stream              |
| `bob@demo.local`   | `Demo1234!` | Viewer — scoped to Search stream                |

> **Safety guard:** The seeder checks `NODE_ENV` and will refuse to run in `production`. Each individual seeder also declares `static environment = ['development']` as a second line of defence.

To reset and reload demo data at any time:

```bash
NODE_ENV=development node ace migration:fresh && node ace db:seed
```

### Creating the first admin user in production

Do not use `db:seed` in production. Instead, create a single admin account via the REPL:

```bash
node ace repl
```

Inside the REPL:

```typescript
const { default: User } = await import('#models/user')
const { default: UserRole } = await import('#models/user_role')

const user = await User.create({
  email: 'admin@yourcompany.com',
  password: 'YourSecurePassword123!',
  fullName: 'Platform Admin',
  isActive: true,
})

await UserRole.create({ userId: user.id, role: 'platform_admin', grantedAt: new Date() })
console.log('Admin user created:', user.id)
process.exit(0)
```

---

## 6. Start the application

### Development (with hot reload)

```bash
node ace serve --hmr
```

The application will be available at `http://localhost:3333`.

### Production

```bash
npm run build
npm start
```

Log in at `/login` using the credentials you just created.

---

## 7. Configure Jira webhooks

1. In Jira, go to **Settings → System → WebHooks** (requires admin).
2. Create a new webhook:
   - **URL**: `https://your-domain.com/api/v1/webhooks/jira`
   - **Events**: Issue created, Issue updated, Issue deleted
3. If you want HMAC verification (recommended), generate a secret and set it:

```env
JIRA_WEBHOOK_SECRET=your-secret-here
```

The platform verifies the `X-Hub-Signature: sha256=<hmac>` header if this variable is set.

---

## 8. Configure GitHub webhooks

For each GitHub repository (or at the organisation level):

1. Go to **Settings → Webhooks → Add webhook**
2. **Payload URL**: `https://your-domain.com/api/v1/webhooks/github`
3. **Content type**: `application/json`
4. **Secret**: generate a random secret and set it in `.env`:

```env
GITHUB_WEBHOOK_SECRET=your-secret-here
```

5. **Events to send**: Select individual events:
   - Pull requests
   - Pull request reviews
   - Deployment statuses
   - Workflow runs

---

## 9. (Optional) Configure OIDC login

See the **OIDC Configuration** section in the [Runbook](runbook.md) for step-by-step Azure registration and environment variable setup.

Set `AUTH_METHOD=oidc` in `.env` to enable SSO login alongside (or instead of) database passwords.

---

## 10. (Optional) Configure alert notifications

To receive Slack alerts when system conditions are triggered:

1. Create a Slack incoming webhook in your Slack workspace.
2. In the platform, navigate to **Admin → Platform Settings → alert_notification_channels**.
3. Set the value to:

```json
{
  "slackWebhookUrl": "https://hooks.slack.com/services/T.../B.../...",
  "minimumSeverity": "MEDIUM"
}
```

Valid severity levels: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

---

## 11. Verify the installation

```bash
# Integration health (requires an API key — see Admin → API Keys)
curl http://localhost:3333/api/v1/admin/integration-health \
  -H "Authorization: Bearer your-api-key"
```

A healthy response looks like:

```json
{
  "status": "ok",
  "data": {
    "integrations": {
      "jira": { "status": "no_data", "lastEventAt": null },
      "github": { "status": "no_data", "lastEventAt": null }
    }
  }
}
```

Once events start arriving from Jira and GitHub, the status changes to `"healthy"`.

---

## Next steps

- Read the [Admin Guide](admin-guide.md) to configure delivery streams, tech streams, and status mappings.
- Read the [Configuration Reference](configuration-reference.md) for a full list of environment variables and platform settings.
- Read the [User Guide](user-guide.md) to understand the dashboard metrics.
