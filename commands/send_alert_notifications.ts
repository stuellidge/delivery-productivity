import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class SendAlertNotifications extends BaseCommand {
  static commandName = 'scheduler:send-alert-notifications'
  static description = 'Check active monitoring alerts and send Slack notifications for new ones'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { default: SystemMonitoringService } = await import('#services/system_monitoring_service')
    await new SystemMonitoringService().notify()
    this.logger.info('Alert notification check complete')
  }
}
