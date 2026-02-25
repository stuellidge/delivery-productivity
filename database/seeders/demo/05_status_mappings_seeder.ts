import { BaseSeeder } from '@adonisjs/lucid/seeders'
import StatusMapping from '#models/status_mapping'

/**
 * Seeds Jira project key + status name → pipeline stage mappings.
 * Development environment only — will not run in test or production.
 */
export default class StatusMappingsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    // Each entry: [jiraProjectKey, jiraStatusName, pipelineStage, isActiveWork, displayOrder]
    const mappings: [string, string, string, boolean, number][] = [
      // ── Payments (PAY) ───────────────────────────────────────────────────────
      ['PAY', 'Backlog', 'backlog', false, 0],
      ['PAY', 'To Do', 'backlog', false, 1],
      ['PAY', 'In Analysis', 'ba', true, 2],
      ['PAY', 'In Progress', 'dev', true, 3],
      ['PAY', 'In Review', 'code_review', true, 4],
      ['PAY', 'Ready for Release', 'code_review', true, 5],
      ['PAY', 'In QA', 'qa', true, 6],
      ['PAY', 'Blocked', 'dev', true, 7], // still active, just blocked in-place
      ['PAY', 'Done', 'done', false, 8],
      ['PAY', 'Closed', 'done', false, 9],

      // ── Search (SRC) ─────────────────────────────────────────────────────────
      ['SRC', 'Open', 'backlog', false, 0],
      ['SRC', 'To Do', 'backlog', false, 1],
      ['SRC', 'In Analysis', 'ba', true, 2],
      ['SRC', 'In Development', 'dev', true, 3],
      ['SRC', 'Code Review', 'code_review', true, 4],
      ['SRC', 'In QA', 'qa', true, 5],
      ['SRC', 'Blocked', 'dev', true, 6],
      ['SRC', 'Resolved', 'done', false, 7],
      ['SRC', 'Done', 'done', false, 8],
    ]

    for (const [jiraProjectKey, jiraStatusName, pipelineStage, isActiveWork, displayOrder] of mappings) {
      await StatusMapping.updateOrCreate(
        { jiraProjectKey, jiraStatusName },
        { pipelineStage: pipelineStage as any, isActiveWork, displayOrder }
      )
    }
  }
}
