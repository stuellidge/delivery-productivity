import vine from '@vinejs/vine'

const PIPELINE_STAGES = [
  'backlog',
  'ba',
  'dev',
  'code_review',
  'qa',
  'uat',
  'done',
  'cancelled',
] as const

export const createStatusMappingValidator = vine.compile(
  vine.object({
    jiraProjectKey: vine.string().trim().minLength(1).maxLength(50).toUpperCase(),
    jiraStatusName: vine.string().trim().minLength(1).maxLength(255),
    pipelineStage: vine.enum(PIPELINE_STAGES),
    isActiveWork: vine.boolean(),
    displayOrder: vine.number().min(0).max(9999).optional(),
  })
)

export const updateStatusMappingValidator = vine.compile(
  vine.object({
    jiraProjectKey: vine.string().trim().minLength(1).maxLength(50).toUpperCase(),
    jiraStatusName: vine.string().trim().minLength(1).maxLength(255),
    pipelineStage: vine.enum(PIPELINE_STAGES),
    isActiveWork: vine.boolean(),
    displayOrder: vine.number().min(0).max(9999).optional(),
  })
)
