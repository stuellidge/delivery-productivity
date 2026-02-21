import vine from '@vinejs/vine'

export const createOidcGroupMappingValidator = vine.compile(
  vine.object({
    provider: vine.string().trim().minLength(1),
    group_pattern: vine.string().trim().minLength(1),
    is_regex: vine.boolean(),
    role: vine.enum(['viewer', 'team_member', 'stream_lead', 'platform_admin'] as const),
    delivery_stream_id: vine.string().optional(),
    tech_stream_id: vine.string().optional(),
  })
)
