import vine from '@vinejs/vine'

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
  })
)
