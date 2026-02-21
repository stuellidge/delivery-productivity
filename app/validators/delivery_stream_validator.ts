import vine from '@vinejs/vine'

export const createDeliveryStreamValidator = vine.compile(
  vine.object({
    name: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(255)
      .regex(/^[a-z0-9-_]+$/)
      .unique(async (db, value) => {
        const row = await db.from('delivery_streams').where('name', value).first()
        return !row
      }),
    displayName: vine.string().trim().minLength(1).maxLength(255),
    description: vine.string().trim().optional(),
  })
)

export const updateDeliveryStreamValidator = vine.withMetaData<{ streamId: number }>().compile(
  vine.object({
    name: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(255)
      .regex(/^[a-z0-9-_]+$/)
      .unique(async (db, value, field) => {
        const row = await db
          .from('delivery_streams')
          .where('name', value)
          .whereNot('id', field.meta.streamId)
          .first()
        return !row
      }),
    displayName: vine.string().trim().minLength(1).maxLength(255),
    description: vine.string().trim().optional(),
    isActive: vine.boolean().optional(),
  })
)
