import { test } from '@japa/runner'
import { pulseSurveyValidator } from '#validators/pulse_survey_validator'

const validBase = {
  delivery_stream_id: 1,
  pace_score: 3,
  tooling_score: 3,
  clarity_score: 3,
}

test.group('PulseSurveyValidator | free_text', () => {
  test('rejects free_text longer than 5000 characters', async ({ assert }) => {
    const longText = 'a'.repeat(5001)
    await assert.rejects(() => pulseSurveyValidator.validate({ ...validBase, free_text: longText }))
  })

  test('accepts free_text of exactly 5000 characters', async ({ assert }) => {
    const exactText = 'a'.repeat(5000)
    const result = await pulseSurveyValidator.validate({ ...validBase, free_text: exactText })
    assert.equal(result.free_text, exactText)
  })

  test('accepts free_text when omitted', async ({ assert }) => {
    const result = await pulseSurveyValidator.validate(validBase)
    assert.isUndefined(result.free_text)
  })
})
