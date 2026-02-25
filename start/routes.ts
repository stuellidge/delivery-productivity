/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')
const SocialAuthController = () => import('#controllers/social_auth_controller')
const DashboardController = () => import('#controllers/dashboard_controller')
const DeliveryStreamsController = () => import('#controllers/admin/delivery_streams_controller')
const TechStreamsController = () => import('#controllers/admin/tech_streams_controller')
const StatusMappingsController = () => import('#controllers/admin/status_mappings_controller')
const OidcGroupMappingsController = () =>
  import('#controllers/admin/oidc_group_mappings_controller')
const AdminUsersController = () => import('#controllers/admin/users_controller')
const JiraWebhookController = () => import('#controllers/webhooks/jira_webhook_controller')
const GithubWebhookController = () => import('#controllers/webhooks/github_webhook_controller')
const ApiStreamsController = () => import('#controllers/api/streams_controller')
const ApiMetricsController = () => import('#controllers/api/metrics_controller')
const AdminApiKeysController = () => import('#controllers/admin/api_keys_controller')
const DeploymentEventsController = () => import('#controllers/api/deployment_events_controller')
const IncidentEventsController = () => import('#controllers/api/incident_events_controller')
const AdminMetricsController = () => import('#controllers/api/admin_metrics_controller')
const PulseSurveyController = () => import('#controllers/pulse_survey_controller')
const CrossStreamController = () => import('#controllers/cross_stream_controller')
const PlatformSettingsController = () => import('#controllers/admin/platform_settings_controller')
const PrLinkController = () => import('#controllers/api/pr_link_controller')
const AdminSessionsController = () => import('#controllers/admin/sessions_controller')
const AuditLogController = () => import('#controllers/admin/audit_log_controller')
const PublicHolidaysController = () => import('#controllers/admin/public_holidays_controller')
const UnlinkedPrsController = () => import('#controllers/admin/unlinked_prs_controller')
const IntegrationHealthController = () => import('#controllers/admin/integration_health_controller')

/*
|--------------------------------------------------------------------------
| Public routes
|--------------------------------------------------------------------------
*/

router.on('/').redirect('/dashboard')

/*
|--------------------------------------------------------------------------
| Auth routes
|--------------------------------------------------------------------------
*/

router.get('/login', [AuthController, 'showLogin']).as('auth.login').use(middleware.guest())

router
  .post('/login', [AuthController, 'login'])
  .as('auth.login.submit')
  .use(middleware.loginThrottle())
  .use(middleware.guest())

router.post('/logout', [AuthController, 'logout']).as('auth.logout').use(middleware.auth())

// Social / OIDC auth — no CSRF needed (GET only, no state-changing body)
router.get('/auth/social/redirect', [SocialAuthController, 'redirect']).as('auth.social.redirect')

router.get('/auth/social/callback', [SocialAuthController, 'callback']).as('auth.social.callback')

/*
|--------------------------------------------------------------------------
| Authenticated routes
|--------------------------------------------------------------------------
*/

router
  .get('/dashboard', [DashboardController, 'index'])
  .as('dashboard.index')
  .use(middleware.auth())

router
  .get('/cross-stream', [CrossStreamController, 'index'])
  .as('cross_stream.index')
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Admin routes — platform_admin role only
|--------------------------------------------------------------------------
*/

router
  .group(() => {
    // Delivery streams management
    router.get('/streams/delivery', [DeliveryStreamsController, 'index'])
    router.get('/streams/delivery/create', [DeliveryStreamsController, 'create'])
    router.post('/streams/delivery', [DeliveryStreamsController, 'store'])
    router.get('/streams/delivery/:id/edit', [DeliveryStreamsController, 'edit'])
    router.put('/streams/delivery/:id', [DeliveryStreamsController, 'update'])
    router.delete('/streams/delivery/:id', [DeliveryStreamsController, 'destroy'])

    // Tech streams management
    router.get('/streams/tech', [TechStreamsController, 'index'])
    router.get('/streams/tech/create', [TechStreamsController, 'create'])
    router.post('/streams/tech', [TechStreamsController, 'store'])
    router.get('/streams/tech/:id/edit', [TechStreamsController, 'edit'])
    router.put('/streams/tech/:id', [TechStreamsController, 'update'])
    router.delete('/streams/tech/:id', [TechStreamsController, 'destroy'])

    // Status mappings management
    router.get('/status-mappings', [StatusMappingsController, 'index'])
    router.get('/status-mappings/create', [StatusMappingsController, 'create'])
    router.post('/status-mappings', [StatusMappingsController, 'store'])
    router.get('/status-mappings/:id/edit', [StatusMappingsController, 'edit'])
    router.put('/status-mappings/:id', [StatusMappingsController, 'update'])
    router.delete('/status-mappings/:id', [StatusMappingsController, 'destroy'])

    // API key management
    router.get('/api-keys', [AdminApiKeysController, 'index'])
    router.get('/api-keys/create', [AdminApiKeysController, 'create'])
    router.post('/api-keys', [AdminApiKeysController, 'store'])
    router.post('/api-keys/:id/revoke', [AdminApiKeysController, 'revoke'])

    // User management
    router.get('/users', [AdminUsersController, 'index']).as('admin.users.index')
    router.get('/users/:id', [AdminUsersController, 'show']).as('admin.users.show')
    router.post('/users/:id/activate', [AdminUsersController, 'activate'])
    router.post('/users/:id/deactivate', [AdminUsersController, 'deactivate'])
    router.post('/users/:id/roles', [AdminUsersController, 'addRole'])
    router.delete('/users/:id/roles/:roleId', [AdminUsersController, 'removeRole'])

    // Platform settings
    router.get('/platform-settings', [PlatformSettingsController, 'index'])
    router.get('/platform-settings/:key/edit', [PlatformSettingsController, 'edit'])
    router.put('/platform-settings/:key', [PlatformSettingsController, 'update'])

    // Session management
    router.get('/sessions', [AdminSessionsController, 'index']).as('admin.sessions.index')
    router.post('/sessions/:id/revoke', [AdminSessionsController, 'revoke'])

    // Audit log
    router.get('/audit-log', [AuditLogController, 'index']).as('admin.audit-log.index')

    // Public holidays
    router.get('/public-holidays', [PublicHolidaysController, 'index'])
    router.get('/public-holidays/create', [PublicHolidaysController, 'create'])
    router.post('/public-holidays', [PublicHolidaysController, 'store'])
    router.delete('/public-holidays/:id', [PublicHolidaysController, 'destroy'])

    // Data quality — unlinked PRs triage
    router.get('/data-quality/unlinked-prs', [UnlinkedPrsController, 'index'])
    router.post('/data-quality/unlinked-prs/:id/link', [UnlinkedPrsController, 'link'])

    // Integration health
    router.get('/integration-health', [IntegrationHealthController, 'index'])

    // OIDC group mappings
    router
      .get('/oidc-group-mappings', [OidcGroupMappingsController, 'index'])
      .as('admin.oidc-group-mappings.index')
    router
      .get('/oidc-group-mappings/create', [OidcGroupMappingsController, 'create'])
      .as('admin.oidc-group-mappings.create')
    router
      .post('/oidc-group-mappings', [OidcGroupMappingsController, 'store'])
      .as('admin.oidc-group-mappings.store')
    router
      .delete('/oidc-group-mappings/:id', [OidcGroupMappingsController, 'destroy'])
      .as('admin.oidc-group-mappings.destroy')
  })
  .prefix('/admin')
  .use([middleware.auth(), middleware.admin()])

/*
|--------------------------------------------------------------------------
| API routes
|--------------------------------------------------------------------------
*/

router.post('/api/v1/webhooks/jira', [JiraWebhookController, 'handle'])
router.post('/api/v1/webhooks/github', [GithubWebhookController, 'handle'])

/*
|--------------------------------------------------------------------------
| API v1 — authenticated via API key
|--------------------------------------------------------------------------
*/

router.get('/survey', [PulseSurveyController, 'show']).as('survey.show').use(middleware.auth())

router.post('/survey', [PulseSurveyController, 'submit']).as('survey.submit').use(middleware.auth())

router
  .group(() => {
    router.get('/streams/delivery', [ApiStreamsController, 'delivery'])
    router.get('/streams/tech', [ApiStreamsController, 'tech'])
    router.get('/sprints', [ApiStreamsController, 'sprints'])
    router.get('/metrics/realtime', [ApiMetricsController, 'realtime'])
    router.get('/metrics/diagnostic', [ApiMetricsController, 'diagnostic'])
    router.get('/metrics/trends', [ApiMetricsController, 'trends'])
    router.get('/metrics/forecast', [ApiMetricsController, 'forecast'])
    router.get('/metrics/pulse', [ApiMetricsController, 'pulse'])
    router.get('/metrics/cross-stream', [ApiMetricsController, 'crossStream'])
    router.get('/admin/data-quality', [AdminMetricsController, 'dataQuality'])
    router.get('/admin/integration-health', [AdminMetricsController, 'integrationHealth'])
    router.get('/admin/system-alerts', [AdminMetricsController, 'systemAlerts'])
    router.post('/admin/backfill/:source/:org', [AdminMetricsController, 'backfill'])
    router.post('/events/deployment', [DeploymentEventsController, 'handle'])
    router.post('/events/incident', [IncidentEventsController, 'handle'])
    router.post('/pr-events/:id/link-ticket', [PrLinkController, 'handle'])
  })
  .prefix('/api/v1')
  .use(middleware.apiKey())
