const cron = require('node-cron');

class MarketingCampaignSchedulerService {
  constructor() {
    this.isRunning = false;
  }

  async run() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const { dispatchDueScheduledCampaigns } = require('../controllers/marketingController');
      const outcomes = await dispatchDueScheduledCampaigns();
      if (outcomes.length) {
        console.log('[MarketingCampaignScheduler] Dispatched', outcomes.length, 'campaign(s)');
      }
    } catch (error) {
      console.error('[MarketingCampaignScheduler] Failed:', error?.message || error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    // Sends queued campaign messages in the background.
    require('./marketingSendQueueService').startWorker();
    // Every 5 minutes
    cron.schedule('*/5 * * * *', () => {
      this.run();
    });
    console.log('[MarketingCampaignScheduler] Scheduled job started (every 5 minutes)');
  }
}

module.exports = new MarketingCampaignSchedulerService();
