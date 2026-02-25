import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'
import DeliveryStream from '#models/delivery_stream'

/**
 * Seeds demo users with realistic roles.
 *
 * Users created:
 *   admin@demo.local   / Demo1234!  — platform_admin
 *   alice@demo.local   / Demo1234!  — stream lead (viewer) for Payments
 *   bob@demo.local     / Demo1234!  — viewer for Search
 *
 * Development environment only — will not run in test or production.
 */
export default class UsersSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const payments = await DeliveryStream.findByOrFail('name', 'payments')
    const search = await DeliveryStream.findByOrFail('name', 'search')

    const admin = await User.updateOrCreate(
      { email: 'admin@demo.local' },
      {
        fullName: 'Platform Admin',
        email: 'admin@demo.local',
        password: 'Demo1234!',
        isActive: true,
      }
    )

    const alice = await User.updateOrCreate(
      { email: 'alice@demo.local' },
      {
        fullName: 'Alice Chen',
        email: 'alice@demo.local',
        password: 'Demo1234!',
        isActive: true,
      }
    )

    const bob = await User.updateOrCreate(
      { email: 'bob@demo.local' },
      {
        fullName: 'Bob Okafor',
        email: 'bob@demo.local',
        password: 'Demo1234!',
        isActive: true,
      }
    )

    // Assign roles — skip if already exists
    const existingRoles = await UserRole.query().whereIn('user_id', [admin.id, alice.id, bob.id])
    const existingSet = new Set(existingRoles.map((r) => `${r.userId}:${r.role}`))

    const rolesToCreate = [
      { userId: admin.id, role: 'platform_admin' as const, deliveryStreamId: null, techStreamId: null },
      { userId: alice.id, role: 'viewer' as const, deliveryStreamId: payments.id, techStreamId: null },
      { userId: bob.id, role: 'viewer' as const, deliveryStreamId: search.id, techStreamId: null },
    ]

    for (const r of rolesToCreate) {
      if (!existingSet.has(`${r.userId}:${r.role}`)) {
        await UserRole.create({
          ...r,
          grantedBy: admin.id,
          grantedAt: DateTime.now(),
        })
      }
    }

    console.log('Demo users seeded:')
    console.log('  admin@demo.local  / Demo1234!  (platform_admin)')
    console.log('  alice@demo.local  / Demo1234!  (viewer — Payments)')
    console.log('  bob@demo.local    / Demo1234!  (viewer — Search)')
  }
}
