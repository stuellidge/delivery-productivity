import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class ProcessEventQueue extends BaseCommand {
  static commandName = 'scheduler:process-event-queue'
  static description = 'Process pending event queue rows and dispatch to normalizer services'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { default: EventQueueService } = await import('#services/event_queue_service')
    const svc = new EventQueueService()
    const result = await svc.processPending()
    this.logger.info(
      `Event queue processed: ${result.processed} completed, ${result.failed} failed, ${result.deadLettered} dead-lettered`
    )
  }
}
