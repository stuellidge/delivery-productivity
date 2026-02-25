import { BaseSeeder } from '@adonisjs/lucid/seeders'
import app from '@adonisjs/core/services/app'

/**
 * Main database seeder — orchestrates all demo seeders.
 *
 * SAFETY: this seeder will ABORT if NODE_ENV is 'production'.
 * All child seeders also declare `static environment = ['development']`
 * as a second line of defence.
 *
 * Usage:
 *   NODE_ENV=development node ace db:seed
 *
 * To seed a fresh database from scratch:
 *   NODE_ENV=development node ace migration:fresh && node ace db:seed
 */
export default class MainSeeder extends BaseSeeder {
  /**
   * Run a child seeder, honouring its `environment` guard.
   */
  private async seed(Seeder: { default: typeof BaseSeeder }) {
    const Klass = Seeder.default
    // Skip if the seeder has an environment restriction that excludes the current env
    if (Klass.environment && Array.isArray(Klass.environment)) {
      const inDev = app.inDev
      if (!Klass.environment.includes('development') && inDev) return
      if (!Klass.environment.includes('production') && app.inProduction) return
      if (!Klass.environment.includes('testing') && app.inTest) return
    }
    await new Klass(this.client).run()
  }

  async run() {
    if (app.inProduction) {
      throw new Error(
        'MainSeeder: refusing to run in production environment. ' +
          'Set NODE_ENV=development to load demo data.'
      )
    }

    console.log('\n🌱 Loading demo seed data...\n')

    // Order matters — each seeder may depend on data from earlier ones
    await this.seed(await import('./demo/00_streams_seeder.js'))
    await this.seed(await import('./demo/01_platform_settings_seeder.js'))
    await this.seed(await import('./demo/03_repositories_seeder.js'))
    await this.seed(await import('./demo/04_sprints_seeder.js'))
    await this.seed(await import('./demo/05_status_mappings_seeder.js'))
    await this.seed(await import('./demo/02_users_seeder.js'))
    await this.seed(await import('./demo/06_work_items_seeder.js'))
    await this.seed(await import('./demo/07_pull_requests_seeder.js'))
    await this.seed(await import('./demo/08_deployments_seeder.js'))
    await this.seed(await import('./demo/09_incidents_seeder.js'))
    await this.seed(await import('./demo/10_pulse_seeder.js'))
    await this.seed(await import('./demo/11_daily_metrics_seeder.js'))

    console.log('\n✅ Demo seed data loaded successfully.\n')
    console.log('Login credentials:')
    console.log('  admin@demo.local  / Demo1234!  (platform admin — full access)')
    console.log('  alice@demo.local  / Demo1234!  (Payments stream lead — viewer)')
    console.log('  bob@demo.local    / Demo1234!  (Search viewer)')
    console.log('')
  }
}
