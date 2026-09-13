const cron = require('node-cron');
const taskAutomationService = require('./taskAutomationService');

class AutoTaskSchedulerService {
  constructor() {
    this.isRunning = false;
  }

  async run() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const quoteResult = await taskAutomationService.runQuoteNoResponseScan();
      console.log('[AutoTaskScheduler] Quote no-response scan completed', quoteResult);
      const reminderResult = await taskAutomationService.runTaskDueReminderScan();
      console.log('[AutoTaskScheduler] Task due-reminder scan completed', reminderResult);
    } catch (error) {
      console.error('[AutoTaskScheduler] Failed:', error?.message || error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    cron.schedule('30 8 * * *', () => {
      this.run();
    });
    console.log('[AutoTaskScheduler] Scheduled job started (runs daily at 8:30 AM)');
  }
}

module.exports = new AutoTaskSchedulerService();
