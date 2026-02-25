import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Repository from '#models/repository'
import TechStream from '#models/tech_stream'

/**
 * Seeds repositories for each tech stream.
 * Development environment only — will not run in test or production.
 */
export default class RepositoriesSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const backend = await TechStream.findByOrFail('github_org', 'acme-demo')
    const frontend = await TechStream.findByOrFail('github_org', 'acme-demo-fe')

    const repos = [
      {
        techStreamId: backend.id,
        githubOrg: 'acme-demo',
        githubRepoName: 'payments-api',
        fullName: 'acme-demo/payments-api',
        defaultBranch: 'main',
        isDeployable: true,
        deployTarget: 'payments-api',
        isActive: true,
      },
      {
        techStreamId: backend.id,
        githubOrg: 'acme-demo',
        githubRepoName: 'payments-worker',
        fullName: 'acme-demo/payments-worker',
        defaultBranch: 'main',
        isDeployable: true,
        deployTarget: 'payments-worker',
        isActive: true,
      },
      {
        techStreamId: backend.id,
        githubOrg: 'acme-demo',
        githubRepoName: 'search-api',
        fullName: 'acme-demo/search-api',
        defaultBranch: 'main',
        isDeployable: true,
        deployTarget: 'search-api',
        isActive: true,
      },
      {
        techStreamId: backend.id,
        githubOrg: 'acme-demo',
        githubRepoName: 'platform-infra',
        fullName: 'acme-demo/platform-infra',
        defaultBranch: 'main',
        isDeployable: false, // infra repo excluded from DORA
        deployTarget: null,
        isActive: true,
      },
      {
        techStreamId: frontend.id,
        githubOrg: 'acme-demo-fe',
        githubRepoName: 'checkout',
        fullName: 'acme-demo-fe/checkout',
        defaultBranch: 'main',
        isDeployable: true,
        deployTarget: 'checkout-app',
        isActive: true,
      },
    ]

    for (const repo of repos) {
      await Repository.updateOrCreate({ fullName: repo.fullName }, repo)
    }
  }
}
