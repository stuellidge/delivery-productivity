import { BaseModel, column } from '@adonisjs/lucid/orm'

export type PipelineStage =
  | 'backlog'
  | 'ba'
  | 'dev'
  | 'code_review'
  | 'qa'
  | 'uat'
  | 'done'
  | 'cancelled'

export default class StatusMapping extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare jiraProjectKey: string

  @column()
  declare jiraStatusName: string

  @column()
  declare pipelineStage: PipelineStage

  @column()
  declare isActiveWork: boolean

  @column()
  declare displayOrder: number
}
