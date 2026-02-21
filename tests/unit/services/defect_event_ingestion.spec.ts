import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import JiraEventNormalizerService from '#services/jira_event_normalizer_service'
import WorkItemEvent from '#models/work_item_event'
import DefectEvent from '#models/defect_event'
import DeliveryStream from '#models/delivery_stream'
import type { JiraWebhookPayload } from '#services/jira_event_normalizer_service'

function buildPayload(overrides: Partial<JiraWebhookPayload> = {}): JiraWebhookPayload {
  return {
    webhookEvent: overrides.webhookEvent ?? 'jira:issue_created',
    issue: {
      key: overrides.issue?.key ?? 'BUG-1',
      fields: {
        issuetype: { name: 'Bug' },
        priority: { name: 'High' },
        labels: [],
        ...(overrides.issue?.fields ?? {}),
      },
    },
    timestamp: overrides.timestamp ?? DateTime.now().toMillis(),
    changelog: overrides.changelog,
  }
}

test.group('DefectEventIngestion | JiraEventNormalizerService', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('does not create defect_event for a story ticket type', async ({ assert }) => {
    const payload = buildPayload({
      issue: {
        key: 'STORY-1',
        fields: {
          issuetype: { name: 'Story' },
          priority: { name: 'Medium' },
        },
      },
    })

    await new JiraEventNormalizerService(payload).process()

    const defect = await DefectEvent.query().where('ticket_id', 'STORY-1').first()
    assert.isNull(defect)
  })

  test('creates defect_event record when a bug ticket is created', async ({ assert }) => {
    const payload = buildPayload()

    await new JiraEventNormalizerService(payload).process()

    const defect = await DefectEvent.query().where('ticket_id', 'BUG-1').first()
    assert.isNotNull(defect)
    assert.equal(defect!.eventType, 'logged')
    assert.equal(defect!.source, 'jira')
  })

  test('sets found_in_stage from custom field when present', async ({ assert }) => {
    const payload = buildPayload({
      issue: {
        key: 'BUG-2',
        fields: {
          issuetype: { name: 'Bug' },
          priority: { name: 'High' },
          customfield_found_in_stage: 'qa',
        },
      },
    })

    await new JiraEventNormalizerService(payload).process()

    const defect = await DefectEvent.query().where('ticket_id', 'BUG-2').first()
    assert.isNotNull(defect)
    assert.equal(defect!.foundInStage, 'qa')
  })

  test('defaults found_in_stage to "unknown" when custom field absent', async ({ assert }) => {
    const payload = buildPayload({ issue: { key: 'BUG-3', fields: { issuetype: { name: 'Bug' } } } })

    await new JiraEventNormalizerService(payload).process()

    const defect = await DefectEvent.query().where('ticket_id', 'BUG-3').first()
    assert.isNotNull(defect)
    assert.equal(defect!.foundInStage, 'unknown')
  })

  test('leaves introduced_in_stage null when custom field absent', async ({ assert }) => {
    const payload = buildPayload({ issue: { key: 'BUG-4', fields: { issuetype: { name: 'Bug' } } } })

    await new JiraEventNormalizerService(payload).process()

    const defect = await DefectEvent.query().where('ticket_id', 'BUG-4').first()
    assert.isNotNull(defect)
    assert.isNull(defect!.introducedInStage)
  })

  test('sets introduced_in_stage from custom field when present', async ({ assert }) => {
    const payload = buildPayload({
      issue: {
        key: 'BUG-5',
        fields: {
          issuetype: { name: 'Bug' },
          customfield_found_in_stage: 'production',
          customfield_introduced_in_stage: 'dev',
        },
      },
    })

    await new JiraEventNormalizerService(payload).process()

    const defect = await DefectEvent.query().where('ticket_id', 'BUG-5').first()
    assert.isNotNull(defect)
    assert.equal(defect!.introducedInStage, 'dev')
  })

  test('is idempotent — does not duplicate on replay with same timestamp', async ({ assert }) => {
    const ts = DateTime.now()
    const payload = buildPayload({
      issue: { key: 'BUG-6', fields: { issuetype: { name: 'Bug' } } },
      timestamp: ts.toMillis(),
    })

    await new JiraEventNormalizerService(payload).process()
    await new JiraEventNormalizerService(payload).process()

    const defects = await DefectEvent.query().where('ticket_id', 'BUG-6')
    assert.equal(defects.length, 1)
  })

  test('creates both work_item_event AND defect_event for bug creation', async ({ assert }) => {
    const payload = buildPayload({
      issue: { key: 'BUG-7', fields: { issuetype: { name: 'Bug' } } },
    })

    await new JiraEventNormalizerService(payload).process()

    const workItem = await WorkItemEvent.query().where('ticket_id', 'BUG-7').first()
    const defect = await DefectEvent.query().where('ticket_id', 'BUG-7').first()

    assert.isNotNull(workItem)
    assert.isNotNull(defect)
  })

  test('maps priority to severity correctly', async ({ assert }) => {
    const cases: Array<{ priority: string; expected: string }> = [
      { priority: 'Critical', expected: 'critical' },
      { priority: 'High', expected: 'high' },
      { priority: 'Medium', expected: 'medium' },
      { priority: 'Low', expected: 'low' },
    ]

    for (const { priority, expected } of cases) {
      const payload = buildPayload({
        issue: {
          key: `BUG-sev-${priority}`,
          fields: { issuetype: { name: 'Bug' }, priority: { name: priority } },
        },
      })

      await new JiraEventNormalizerService(payload).process()

      const defect = await DefectEvent.query()
        .where('ticket_id', `BUG-sev-${priority}`)
        .first()
      assert.equal(defect!.severity, expected)
    }
  })

  test('sets severity to null for unknown priority', async ({ assert }) => {
    const payload = buildPayload({
      issue: {
        key: 'BUG-null-sev',
        fields: { issuetype: { name: 'Bug' }, priority: { name: 'Unknown' } },
      },
    })

    await new JiraEventNormalizerService(payload).process()

    const defect = await DefectEvent.query().where('ticket_id', 'BUG-null-sev').first()
    assert.isNull(defect!.severity)
  })

  test('handles bug (case-insensitive) ticket type', async ({ assert }) => {
    const payload = buildPayload({
      issue: { key: 'BUG-ci', fields: { issuetype: { name: 'bug' } } },
    })

    await new JiraEventNormalizerService(payload).process()

    const defect = await DefectEvent.query().where('ticket_id', 'BUG-ci').first()
    assert.isNotNull(defect)
  })

  test('resolves delivery_stream_id on defect_event when stream present', async ({ assert }) => {
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })

    const payload = buildPayload({
      issue: {
        key: 'BUG-ds',
        fields: {
          issuetype: { name: 'Bug' },
          customfield_delivery_stream: 'payments',
        },
      },
    })

    await new JiraEventNormalizerService(payload).process()

    const defect = await DefectEvent.query().where('ticket_id', 'BUG-ds').first()
    assert.equal(defect!.deliveryStreamId, stream.id)
  })
})
