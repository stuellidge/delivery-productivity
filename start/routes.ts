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
const DashboardController = () => import('#controllers/dashboard_controller')
const DeliveryStreamsController = () => import('#controllers/admin/delivery_streams_controller')
const TechStreamsController = () => import('#controllers/admin/tech_streams_controller')
const StatusMappingsController = () => import('#controllers/admin/status_mappings_controller')
const JiraWebhookController = () => import('#controllers/webhooks/jira_webhook_controller')
const GithubWebhookController = () => import('#controllers/webhooks/github_webhook_controller')
const ApiStreamsController = () => import('#controllers/api/streams_controller')
const ApiMetricsController = () => import('#controllers/api/metrics_controller')

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

router.post('/login', [AuthController, 'login']).as('auth.login.submit').use(middleware.guest())

router.post('/logout', [AuthController, 'logout']).as('auth.logout').use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Authenticated routes
|--------------------------------------------------------------------------
*/

router
  .get('/dashboard', [DashboardController, 'index'])
  .as('dashboard.index')
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

router
  .group(() => {
    router.get('/streams/delivery', [ApiStreamsController, 'delivery'])
    router.get('/streams/tech', [ApiStreamsController, 'tech'])
    router.get('/metrics/realtime', [ApiMetricsController, 'realtime'])
    router.get('/metrics/diagnostic', [ApiMetricsController, 'diagnostic'])
  })
  .prefix('/api/v1')
  .use(middleware.apiKey())
