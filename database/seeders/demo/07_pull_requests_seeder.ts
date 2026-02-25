import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import PrEvent from '#models/pr_event'
import PrCycle from '#models/pr_cycle'
import Repository from '#models/repository'
import TechStream from '#models/tech_stream'
import DeliveryStream from '#models/delivery_stream'

/**
 * Seeds PR events and cycles — underpins lead time and PR review turnaround metrics.
 * Covers 90 days of history across three repositories.
 * Development environment only — will not run in test or production.
 */
export default class PullRequestsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const backend = await TechStream.findByOrFail('github_org', 'acme-demo')
    const frontend = await TechStream.findByOrFail('github_org', 'acme-demo-fe')
    const payments = await DeliveryStream.findByOrFail('name', 'payments')
    const search = await DeliveryStream.findByOrFail('name', 'search')

    const paymentsApiRepo = await Repository.findByOrFail('full_name', 'acme-demo/payments-api')
    const searchApiRepo = await Repository.findByOrFail('full_name', 'acme-demo/search-api')
    const checkoutRepo = await Repository.findByOrFail('full_name', 'acme-demo-fe/checkout')

    const now = DateTime.now()

    // Pseudonymised author/reviewer hashes (as would be produced by HMAC)
    const authorHashes = [
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
      'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
      'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
    ]

    // [repoId, techStreamId, deliveryStreamId, prNumber, daysAgo (merged), openedHrsBefore, reviewHrsBefore, leadTimeHrs, linkedTicketId, linesAdded, linesRemoved]
    const prs: [
      Repository,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      string | null,
      number,
      number,
    ][] = [
      // payments-api PRs
      [paymentsApiRepo, backend.id, payments.id, 101, 85, 18, 6, 18, 'PAY-101', 42, 18],
      [paymentsApiRepo, backend.id, payments.id, 102, 80, 8, 4, 8, 'PAY-102', 15, 8],
      [paymentsApiRepo, backend.id, payments.id, 103, 74, 24, 12, 24, 'PAY-103', 98, 42],
      [paymentsApiRepo, backend.id, payments.id, 104, 70, 12, 5, 12, 'PAY-104', 28, 12],
      [paymentsApiRepo, backend.id, payments.id, 105, 65, 6, 3, 6, 'PAY-105', 8, 4],
      [paymentsApiRepo, backend.id, payments.id, 106, 60, 20, 8, 20, 'PAY-106', 55, 25],
      [paymentsApiRepo, backend.id, payments.id, 107, 54, 14, 6, 14, 'PAY-107', 32, 16],
      [paymentsApiRepo, backend.id, payments.id, 108, 48, 16, 7, 16, 'PAY-108', 45, 20],
      [paymentsApiRepo, backend.id, payments.id, 109, 43, 28, 14, 28, 'PAY-109', 120, 60],
      [paymentsApiRepo, backend.id, payments.id, 110, 37, 8, 3, 8, 'PAY-110', 12, 5],
      [paymentsApiRepo, backend.id, payments.id, 111, 32, 10, 5, 10, 'PAY-111', 22, 10],
      [paymentsApiRepo, backend.id, payments.id, 112, 28, 6, 2, 6, 'PAY-112', 9, 4],
      [paymentsApiRepo, backend.id, payments.id, 113, 23, 18, 8, 18, 'PAY-113', 48, 22],
      [paymentsApiRepo, backend.id, payments.id, 114, 18, 22, 10, 22, 'PAY-114', 85, 38],
      [paymentsApiRepo, backend.id, payments.id, 115, 14, 7, 3, 7, 'PAY-115', 18, 8],
      [paymentsApiRepo, backend.id, payments.id, 116, 10, 5, 2, 5, 'PAY-116', 6, 3],
      [paymentsApiRepo, backend.id, payments.id, 117, 7, 14, 6, 14, 'PAY-117', 38, 18],
      [paymentsApiRepo, backend.id, payments.id, 118, 5, 8, 4, 8, 'PAY-118', 20, 9],
      [paymentsApiRepo, backend.id, payments.id, 119, 3, 12, 5, 12, 'PAY-119', 35, 15],

      // search-api PRs
      [searchApiRepo, backend.id, search.id, 201, 80, 24, 10, 24, 'SRC-101', 68, 30],
      [searchApiRepo, backend.id, search.id, 202, 72, 10, 5, 10, 'SRC-102', 18, 8],
      [searchApiRepo, backend.id, search.id, 203, 65, 28, 12, 28, 'SRC-103', 95, 45],
      [searchApiRepo, backend.id, search.id, 204, 55, 12, 6, 12, 'SRC-104', 30, 14],
      [searchApiRepo, backend.id, search.id, 205, 45, 8, 4, 8, 'SRC-105', 14, 6],
      [searchApiRepo, backend.id, search.id, 206, 35, 32, 15, 32, 'SRC-106', 140, 65],
      [searchApiRepo, backend.id, search.id, 207, 25, 10, 5, 10, 'SRC-107', 25, 12],
      [searchApiRepo, backend.id, search.id, 208, 16, 20, 8, 20, 'SRC-108', 75, 35],
      [searchApiRepo, backend.id, search.id, 209, 10, 6, 3, 6, 'SRC-109', 10, 4],
      [searchApiRepo, backend.id, search.id, 210, 4, 14, 6, 14, 'SRC-110', 40, 18],

      // checkout (frontend) PRs
      [checkoutRepo, frontend.id, payments.id, 301, 75, 16, 6, 16, 'PAY-104', 35, 15],
      [checkoutRepo, frontend.id, payments.id, 302, 60, 10, 4, 10, 'PAY-107', 18, 8],
      [checkoutRepo, frontend.id, payments.id, 303, 45, 20, 8, 20, 'PAY-111', 52, 22],
      [checkoutRepo, frontend.id, payments.id, 304, 30, 8, 3, 8, 'PAY-115', 12, 5],
      [checkoutRepo, frontend.id, payments.id, 305, 14, 14, 5, 14, 'PAY-119', 28, 12],
    ]

    for (let i = 0; i < prs.length; i++) {
      const [
        repo,
        techStreamId,
        deliveryStreamId,
        prNumber,
        daysAgo,
        openedHrsBefore,
        reviewHrsBefore,
        ,
        linkedTicketId,
        linesAdded,
        linesRemoved,
      ] = prs[i]
      const authorHash = authorHashes[i % authorHashes.length]
      const reviewerHash = authorHashes[(i + 1) % authorHashes.length]

      const mergedAt = now.minus({ days: daysAgo })
      const openedAt = mergedAt.minus({ hours: openedHrsBefore })
      const reviewedAt = mergedAt.minus({ hours: reviewHrsBefore })

      // Skip if already exists
      const existing = await PrEvent.query()
        .where('repo_id', repo.id)
        .where('pr_number', prNumber)
        .where('event_type', 'opened')
        .first()

      if (!existing) {
        await PrEvent.createMany([
          {
            source: 'github',
            eventType: 'opened',
            prNumber,
            repoId: repo.id,
            githubOrg: repo.githubOrg,
            githubRepo: repo.githubRepoName,
            authorHash,
            branchName: `feature/${linkedTicketId?.toLowerCase() ?? `pr-${prNumber}`}`,
            linkedTicketId,
            baseBranch: 'main',
            linesAdded,
            linesRemoved,
            filesChanged: Math.ceil(linesAdded / 15),
            techStreamId,
            deliveryStreamId,
            eventTimestamp: openedAt,
          },
          {
            source: 'github',
            eventType: 'approved',
            prNumber,
            repoId: repo.id,
            githubOrg: repo.githubOrg,
            githubRepo: repo.githubRepoName,
            authorHash,
            reviewerHash,
            reviewState: 'approved',
            linkedTicketId,
            baseBranch: 'main',
            techStreamId,
            deliveryStreamId,
            eventTimestamp: reviewedAt,
          },
          {
            source: 'github',
            eventType: 'merged',
            prNumber,
            repoId: repo.id,
            githubOrg: repo.githubOrg,
            githubRepo: repo.githubRepoName,
            authorHash,
            linkedTicketId,
            baseBranch: 'main',
            techStreamId,
            deliveryStreamId,
            eventTimestamp: mergedAt,
          },
        ])

        await PrCycle.updateOrCreate(
          { repoId: repo.id, prNumber },
          {
            repoId: repo.id,
            techStreamId,
            deliveryStreamId,
            prNumber,
            linkedTicketId,
            authorHash,
            openedAt,
            firstReviewAt: reviewedAt,
            approvedAt: reviewedAt,
            mergedAt,
            timeToFirstReviewHrs: openedHrsBefore - reviewHrsBefore,
            timeToMergeHrs: openedHrsBefore,
            reviewRounds: 1,
            reviewerHashes: [reviewerHash],
            reviewerCount: 1,
            linesChanged: linesAdded + linesRemoved,
            filesChanged: Math.ceil(linesAdded / 15),
          }
        )
      }
    }
  }
}
