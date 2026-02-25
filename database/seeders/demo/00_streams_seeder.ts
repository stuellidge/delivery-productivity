import { BaseSeeder } from '@adonisjs/lucid/seeders'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'

/**
 * Seeds delivery and tech streams.
 * Must run before all other demo seeders (prefix 00_).
 * Development environment only — will not run in test or production.
 */
export default class StreamsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    // Delivery streams
    await DeliveryStream.updateOrCreate(
      { name: 'payments' },
      {
        name: 'payments',
        displayName: 'Payments',
        description: 'Owns the payments checkout and refund flows',
        isActive: true,
        teamSize: 8,
      }
    )

    await DeliveryStream.updateOrCreate(
      { name: 'search' },
      {
        name: 'search',
        displayName: 'Search & Discovery',
        description: 'Product search, recommendations, and catalogue browsing',
        isActive: true,
        teamSize: 5,
      }
    )

    // Tech streams
    await TechStream.updateOrCreate(
      { githubOrg: 'acme-demo' },
      {
        name: 'platform-backend',
        displayName: 'Platform Backend',
        githubOrg: 'acme-demo',
        githubInstallId: '99990001',
        description: 'Core backend services — payments, search, shared platform',
        isActive: true,
        minContributors: 3,
        ticketRegex: null,
      }
    )

    await TechStream.updateOrCreate(
      { githubOrg: 'acme-demo-fe' },
      {
        name: 'frontend',
        displayName: 'Frontend',
        githubOrg: 'acme-demo-fe',
        githubInstallId: '99990002',
        description: 'Customer-facing web application',
        isActive: true,
        minContributors: 2,
        ticketRegex: null,
      }
    )
  }
}
