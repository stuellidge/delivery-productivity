import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'

async function createAdminUser() {
  const user = await User.create({
    fullName: 'Admin User',
    email: 'admin@example.com',
    password: 'password123',
    isActive: true,
  })
  await UserRole.create({
    userId: user.id,
    role: 'platform_admin',
    grantedAt: DateTime.now(),
  })
  return user
}

async function createViewerUser() {
  return User.create({
    fullName: 'Viewer',
    email: 'viewer@example.com',
    password: 'password123',
    isActive: true,
  })
}

async function createRepo() {
  const ts = await TechStream.create({
    name: 'core-api',
    displayName: 'Core API',
    githubOrg: 'acme-core-api',
    githubInstallId: 'inst-1',
    isActive: true,
  })
  return Repository.create({
    techStreamId: ts.id,
    githubOrg: 'acme-core-api',
    githubRepoName: 'payments-svc',
    fullName: 'acme-core-api/payments-svc',
    defaultBranch: 'main',
    isActive: true,
  })
}

test.group('Admin | Unlinked PRs | index', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects unauthenticated users to login', async ({ client }) => {
    const response = await client.get('/admin/data-quality/unlinked-prs').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('returns 302 for non-admin users', async ({ client }) => {
    const viewer = await createViewerUser()
    const response = await client
      .get('/admin/data-quality/unlinked-prs')
      .loginAs(viewer)
      .redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })

  test('lists PRs where linked_ticket_id is null', async ({ client }) => {
    const admin = await createAdminUser()
    const repo = await createRepo()

    await PrEvent.create({
      source: 'github',
      techStreamId: repo.techStreamId,
      eventTimestamp: DateTime.now(),
      eventType: 'opened',
      prNumber: 42,
      repoId: repo.id,
      githubOrg: 'acme-core-api',
      githubRepo: 'payments-svc',
      authorHash: 'abc123',
      branchName: 'feat/no-ticket',
      linkedTicketId: null,
    })

    const response = await client.get('/admin/data-quality/unlinked-prs').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('feat/no-ticket')
    response.assertTextIncludes('#42')
  })

  test('does not show PRs that are already linked', async ({ client }) => {
    const admin = await createAdminUser()
    const repo = await createRepo()

    await PrEvent.create({
      source: 'github',
      techStreamId: repo.techStreamId,
      eventTimestamp: DateTime.now(),
      eventType: 'opened',
      prNumber: 99,
      repoId: repo.id,
      githubOrg: 'acme-core-api',
      githubRepo: 'payments-svc',
      authorHash: 'abc123',
      branchName: 'feat/PAY-999-linked',
      linkedTicketId: 'PAY-999',
    })

    const response = await client.get('/admin/data-quality/unlinked-prs').loginAs(admin)
    response.assertStatus(200)
    // linked PR should NOT appear
    const text = response.text()
    if (text.includes('PAY-999')) {
      throw new Error('Linked PR should not be shown on unlinked PRs page')
    }
  })
})

test.group('Admin | Unlinked PRs | link', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('links a PR to a ticket via form POST', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const repo = await createRepo()

    const pr = await PrEvent.create({
      source: 'github',
      techStreamId: repo.techStreamId,
      eventTimestamp: DateTime.now(),
      eventType: 'opened',
      prNumber: 77,
      repoId: repo.id,
      githubOrg: 'acme-core-api',
      githubRepo: 'payments-svc',
      authorHash: 'abc123',
      branchName: 'feat/no-ticket',
      linkedTicketId: null,
    })

    const response = await client
      .post(`/admin/data-quality/unlinked-prs/${pr.id}/link`)
      .loginAs(admin)
      .withCsrfToken()
      .fields({ ticketId: 'PAY-123' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/data-quality/unlinked-prs')

    await pr.refresh()
    assert.equal(pr.linkedTicketId, 'PAY-123')
  })

  test('rejects empty ticket ID', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const repo = await createRepo()

    const pr = await PrEvent.create({
      source: 'github',
      techStreamId: repo.techStreamId,
      eventTimestamp: DateTime.now(),
      eventType: 'opened',
      prNumber: 77,
      repoId: repo.id,
      githubOrg: 'acme-core-api',
      githubRepo: 'payments-svc',
      authorHash: 'abc123',
      branchName: 'feat/no-ticket',
      linkedTicketId: null,
    })

    await client
      .post(`/admin/data-quality/unlinked-prs/${pr.id}/link`)
      .loginAs(admin)
      .withCsrfToken()
      .fields({ ticketId: '' })
      .redirects(0)

    await pr.refresh()
    assert.isNull(pr.linkedTicketId)
  })
})
