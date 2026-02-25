import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import DeploymentRecord from '#models/deployment_record'
import Repository from '#models/repository'
import TechStream from '#models/tech_stream'

/**
 * Seeds production deployment records across 90 days.
 * Produces realistic DORA deployment frequency, lead time, and change failure rate data.
 *
 * Targets (High–Elite performer band):
 *   - Deployment frequency: ~4–5/week for Platform Backend, ~2/week for Frontend
 *   - Change failure rate: ~7% (some caused incidents, some rolled back)
 *   - Lead time P50: ~12 hrs, P85: ~22 hrs
 *
 * Development environment only — will not run in test or production.
 */
export default class DeploymentsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const backend = await TechStream.findByOrFail('github_org', 'acme-demo')
    const frontend = await TechStream.findByOrFail('github_org', 'acme-demo-fe')

    const paymentsApiRepo = await Repository.findByOrFail('full_name', 'acme-demo/payments-api')
    const paymentsWorkerRepo = await Repository.findByOrFail(
      'full_name',
      'acme-demo/payments-worker'
    )
    const searchApiRepo = await Repository.findByOrFail('full_name', 'acme-demo/search-api')
    const checkoutRepo = await Repository.findByOrFail('full_name', 'acme-demo-fe/checkout')

    const now = DateTime.now()

    // Each deploy definition: [repoId, techStreamId, daysAgo, leadTimeHrs, status, causedIncident, linkedPrNumber, linkedTicketId]
    type DeployDef = {
      repo: Repository
      techStreamId: number
      daysAgo: number
      leadTimeHrs: number
      status: 'success' | 'failed' | 'rolled_back' | 'cancelled'
      causedIncident: boolean
      linkedPrNumber: number | null
      linkedTicketId: string | null
    }

    const deploys: DeployDef[] = [
      // ── payments-api (daily-ish, Mon–Fri) ─────────────────────────────────
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 88,
        leadTimeHrs: 14,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 101,
        linkedTicketId: 'PAY-101',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 83,
        leadTimeHrs: 8,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 102,
        linkedTicketId: 'PAY-102',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 78,
        leadTimeHrs: 22,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 103,
        linkedTicketId: 'PAY-103',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 73,
        leadTimeHrs: 12,
        status: 'rolled_back',
        causedIncident: false,
        linkedPrNumber: 104,
        linkedTicketId: 'PAY-104',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 68,
        leadTimeHrs: 6,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 105,
        linkedTicketId: 'PAY-105',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 63,
        leadTimeHrs: 18,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 106,
        linkedTicketId: 'PAY-106',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 58,
        leadTimeHrs: 14,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 107,
        linkedTicketId: 'PAY-107',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 53,
        leadTimeHrs: 16,
        status: 'success',
        causedIncident: true,
        linkedPrNumber: 108,
        linkedTicketId: 'PAY-108',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 48,
        leadTimeHrs: 24,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 109,
        linkedTicketId: 'PAY-109',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 44,
        leadTimeHrs: 8,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 110,
        linkedTicketId: 'PAY-110',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 40,
        leadTimeHrs: 10,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 111,
        linkedTicketId: 'PAY-111',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 36,
        leadTimeHrs: 6,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 112,
        linkedTicketId: 'PAY-112',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 32,
        leadTimeHrs: 18,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 113,
        linkedTicketId: 'PAY-113',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 27,
        leadTimeHrs: 20,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 114,
        linkedTicketId: 'PAY-114',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 22,
        leadTimeHrs: 7,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 115,
        linkedTicketId: 'PAY-115',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 18,
        leadTimeHrs: 5,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 116,
        linkedTicketId: 'PAY-116',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 14,
        leadTimeHrs: 14,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 117,
        linkedTicketId: 'PAY-117',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 10,
        leadTimeHrs: 8,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 118,
        linkedTicketId: 'PAY-118',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 6,
        leadTimeHrs: 12,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 119,
        linkedTicketId: 'PAY-119',
      },
      {
        repo: paymentsApiRepo,
        techStreamId: backend.id,
        daysAgo: 2,
        leadTimeHrs: 9,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },

      // ── payments-worker ────────────────────────────────────────────────────
      {
        repo: paymentsWorkerRepo,
        techStreamId: backend.id,
        daysAgo: 85,
        leadTimeHrs: 16,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },
      {
        repo: paymentsWorkerRepo,
        techStreamId: backend.id,
        daysAgo: 75,
        leadTimeHrs: 12,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },
      {
        repo: paymentsWorkerRepo,
        techStreamId: backend.id,
        daysAgo: 64,
        leadTimeHrs: 10,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },
      {
        repo: paymentsWorkerRepo,
        techStreamId: backend.id,
        daysAgo: 55,
        leadTimeHrs: 18,
        status: 'success',
        causedIncident: true,
        linkedPrNumber: null,
        linkedTicketId: null,
      },
      {
        repo: paymentsWorkerRepo,
        techStreamId: backend.id,
        daysAgo: 45,
        leadTimeHrs: 8,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },
      {
        repo: paymentsWorkerRepo,
        techStreamId: backend.id,
        daysAgo: 35,
        leadTimeHrs: 14,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },
      {
        repo: paymentsWorkerRepo,
        techStreamId: backend.id,
        daysAgo: 25,
        leadTimeHrs: 11,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },
      {
        repo: paymentsWorkerRepo,
        techStreamId: backend.id,
        daysAgo: 15,
        leadTimeHrs: 7,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },
      {
        repo: paymentsWorkerRepo,
        techStreamId: backend.id,
        daysAgo: 5,
        leadTimeHrs: 13,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },

      // ── search-api ────────────────────────────────────────────────────────
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 82,
        leadTimeHrs: 22,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 201,
        linkedTicketId: 'SRC-101',
      },
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 74,
        leadTimeHrs: 10,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 202,
        linkedTicketId: 'SRC-102',
      },
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 67,
        leadTimeHrs: 26,
        status: 'rolled_back',
        causedIncident: false,
        linkedPrNumber: 203,
        linkedTicketId: 'SRC-103',
      },
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 57,
        leadTimeHrs: 12,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 204,
        linkedTicketId: 'SRC-104',
      },
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 47,
        leadTimeHrs: 8,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 205,
        linkedTicketId: 'SRC-105',
      },
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 37,
        leadTimeHrs: 30,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 206,
        linkedTicketId: 'SRC-106',
      },
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 27,
        leadTimeHrs: 10,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 207,
        linkedTicketId: 'SRC-107',
      },
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 18,
        leadTimeHrs: 18,
        status: 'success',
        causedIncident: true,
        linkedPrNumber: 208,
        linkedTicketId: 'SRC-108',
      },
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 11,
        leadTimeHrs: 6,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 209,
        linkedTicketId: 'SRC-109',
      },
      {
        repo: searchApiRepo,
        techStreamId: backend.id,
        daysAgo: 4,
        leadTimeHrs: 14,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 210,
        linkedTicketId: 'SRC-110',
      },

      // ── checkout (frontend) ────────────────────────────────────────────────
      {
        repo: checkoutRepo,
        techStreamId: frontend.id,
        daysAgo: 78,
        leadTimeHrs: 14,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 301,
        linkedTicketId: 'PAY-104',
      },
      {
        repo: checkoutRepo,
        techStreamId: frontend.id,
        daysAgo: 62,
        leadTimeHrs: 10,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 302,
        linkedTicketId: 'PAY-107',
      },
      {
        repo: checkoutRepo,
        techStreamId: frontend.id,
        daysAgo: 48,
        leadTimeHrs: 18,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 303,
        linkedTicketId: 'PAY-111',
      },
      {
        repo: checkoutRepo,
        techStreamId: frontend.id,
        daysAgo: 32,
        leadTimeHrs: 8,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 304,
        linkedTicketId: 'PAY-115',
      },
      {
        repo: checkoutRepo,
        techStreamId: frontend.id,
        daysAgo: 16,
        leadTimeHrs: 12,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: 305,
        linkedTicketId: 'PAY-119',
      },
      {
        repo: checkoutRepo,
        techStreamId: frontend.id,
        daysAgo: 3,
        leadTimeHrs: 9,
        status: 'success',
        causedIncident: false,
        linkedPrNumber: null,
        linkedTicketId: null,
      },
    ]

    for (const d of deploys) {
      const deployedAt = now.minus({ days: d.daysAgo })
      const existing = await DeploymentRecord.query()
        .where('repo_id', d.repo.id)
        .where('deployed_at', deployedAt.toSQL()!)
        .first()

      if (!existing) {
        await DeploymentRecord.create({
          techStreamId: d.techStreamId,
          repoId: d.repo.id,
          environment: 'production',
          status: d.status,
          commitSha: `demo${d.daysAgo.toString().padStart(3, '0')}${d.repo.githubRepoName.substring(0, 4)}`,
          pipelineId: `pipeline-${d.daysAgo}-${d.repo.id}`,
          triggerType: 'push',
          linkedPrNumber: d.linkedPrNumber,
          linkedTicketId: d.linkedTicketId,
          leadTimeHrs: d.leadTimeHrs,
          causedIncident: d.causedIncident,
          deployedAt,
        })
      }
    }
  }
}
