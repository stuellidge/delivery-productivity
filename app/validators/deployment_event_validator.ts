import vine from '@vinejs/vine'

export const deploymentEventValidator = vine.compile(
  vine.object({
    repo_full_name: vine.string().trim().minLength(1),
    deployed_at: vine.string().trim(),
    environment: vine.string().trim().minLength(1).maxLength(100),
    status: vine.enum(['success', 'failed', 'rolled_back', 'cancelled'] as const),
    pr_number: vine.number().optional(),
    commit_sha: vine.string().trim().optional(),
    pipeline_id: vine.string().trim().optional(),
    trigger_type: vine.string().trim().optional(),
  })
)
