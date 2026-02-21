import vine from '@vinejs/vine'

export const pulseSurveyValidator = vine.compile(
  vine.object({
    delivery_stream_id: vine.number().positive(),
    pace_score: vine.number().min(1).max(5),
    tooling_score: vine.number().min(1).max(5),
    clarity_score: vine.number().min(1).max(5),
    free_text: vine.string().optional(),
  })
)
