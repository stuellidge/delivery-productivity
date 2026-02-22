import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'

function validateRegexPattern(value: unknown, _options: undefined, field: FieldContext) {
  if (typeof value !== 'string') return
  try {
    new RegExp(value)
  } catch {
    field.report(
      'The {{ field }} field is not a valid regular expression pattern.',
      'regex_compile',
      field
    )
  }
}

const regexPatternRule = vine.createRule(validateRegexPattern)

export const createTechStreamValidator = vine.compile(
  vine.object({
    name: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(255)
      .regex(/^[a-z0-9-_]+$/)
      .unique(async (db, value) => {
        const row = await db.from('tech_streams').where('name', value).first()
        return !row
      }),
    displayName: vine.string().trim().minLength(1).maxLength(255),
    githubOrg: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(255)
      .unique(async (db, value) => {
        const row = await db.from('tech_streams').where('github_org', value).first()
        return !row
      }),
    githubInstallId: vine.string().trim().minLength(1).maxLength(255),
    description: vine.string().trim().optional(),
    ticketRegex: vine.string().trim().maxLength(500).use(regexPatternRule()).optional(),
    minContributors: vine.number().min(2).max(100).optional(),
  })
)

export const updateTechStreamValidator = vine.withMetaData<{ streamId: number }>().compile(
  vine.object({
    name: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(255)
      .regex(/^[a-z0-9-_]+$/)
      .unique(async (db, value, field) => {
        const row = await db
          .from('tech_streams')
          .where('name', value)
          .whereNot('id', field.meta.streamId)
          .first()
        return !row
      }),
    displayName: vine.string().trim().minLength(1).maxLength(255),
    githubOrg: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(255)
      .unique(async (db, value, field) => {
        const row = await db
          .from('tech_streams')
          .where('github_org', value)
          .whereNot('id', field.meta.streamId)
          .first()
        return !row
      }),
    githubInstallId: vine.string().trim().minLength(1).maxLength(255),
    description: vine.string().trim().optional(),
    isActive: vine.boolean().optional(),
    ticketRegex: vine.string().trim().maxLength(500).use(regexPatternRule()).optional(),
    minContributors: vine.number().min(2).max(100).optional(),
  })
)
