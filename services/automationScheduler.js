const cron = require('node-cron');
const mongoose = require('mongoose'); // For ObjectId
const User = require('../models/User');
const { logActivity } = require('./activityLogService');
const { recordUsage } = require('./usageTrackingService');
const subscriptionService = require('./subscriptionService'); // Import SubscriptionService

class AutomationScheduler {
  constructor(realtimeServiceInstance) {
    this.realtimeService = realtimeServiceInstance;
    // No need to pass subscriptionService here, can use the imported instance directly.
    this.task = null;
  }

  // Schedule: "At minute 0 past every hour" -> '0 * * * *'
  // For testing, run "every 1 minute": '*/1 * * * *'
  start(cronExpression = '*/5 * * * *') { // Default: every 5 minutes for less noise
    if (this.task) {
      console.log('Automation scheduler is already running.');
      return;
    }

    if (!cron.validate(cronExpression)) {
        console.error(`Invalid cron expression: ${cronExpression}. Scheduler not started.`);
        return;
    }

    console.log(`Starting automation scheduler with cron expression: ${cronExpression}`);
    this.task = cron.schedule(cronExpression, async () => {
      console.log('Running scheduled automation check for eligible users...');
      await this.processAutomations();
    });
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('Automation scheduler stopped.');
    } else {
      console.log('Automation scheduler is not running.');
    }
  }

  async processAutomations() {
    try {
      const potentiallyEligibleUsers = await User.find({
        is247AutomationEnabled: true,
        mcpPlan: 'PREMIUM_24_7', // Initial filter by plan
        'automationSettings.preferredTopic': { $exists: true, $ne: null, $ne: '' } // Ensure topic is set and not empty
      }).select('_id telegram_id automationSettings mcpPlan nextPaymentDate'); // Select fields needed for subscription check too

      if (potentiallyEligibleUsers.length === 0) {
        console.log('Scheduler: No users found with automation enabled, PREMIUM_24_7 plan, and a preferred topic.');
        return;
      }

      console.log(`Scheduler: Found ${potentiallyEligibleUsers.length} potentially eligible users.`);
      let actualEligibleCount = 0;

      for (const user of potentiallyEligibleUsers) {
        const subscriptionStatus = await subscriptionService.checkSubscriptionStatus(user._id.toString());

        if (!subscriptionStatus.isActive) {
          console.log(`Scheduler: User ${user._id} has is247AutomationEnabled but subscription is not active (Plan: ${subscriptionStatus.plan}, NextPayment: ${subscriptionStatus.nextPaymentDate}). Skipping.`);
          // Optional: Downgrade user or turn off automation if subscription expired
          // if (user.mcpPlan === 'PREMIUM_24_7' && user.nextPaymentDate && user.nextPaymentDate <= new Date()) {
          //   user.is247AutomationEnabled = false;
          //   user.mcpPlan = 'FREE'; // Or an 'EXPIRED_PREMIUM' status
          //   await user.save();
          //   await logActivity(user._id, 'USER_AUTOMATION_DISABLED_SUBSCRIPTION_EXPIRED', { oldPlan: 'PREMIUM_24_7' }, 'SUCCESS');
          // }
          continue; // Skip to the next user
        }

        actualEligibleCount++;
        const baseTopic = user.automationSettings.preferredTopic; // Already checked for existence
        const niche = user.automationSettings.preferredNiche;
        const effectiveTopic = niche ? `${baseTopic} (related to ${niche})` : baseTopic;
        const operationId = new mongoose.Types.ObjectId();

        console.log(`Scheduler: Processing automated MCP task for active subscriber ${user._id} with effectiveTopic "${effectiveTopic}" (Base: "${baseTopic}", Niche: "${niche || 'N/A'}")`);

        const logDetails = {
            operationId: operationId.toString(),
            baseTopic,
            niche: niche || null,
            effectiveTopic,
            source: 'scheduler'
        };
        await logActivity(user._id, 'MCP_AUTOMATED_TRIGGER_INITIATED', logDetails, 'PENDING', operationId);

        if (this.realtimeService) {
          this.realtimeService.sendMessageToUser(user._id.toString(), {
            type: 'MCP_AUTOMATED_TASK_QUEUED',
            data: { operationId: operationId.toString(), effectiveTopic, baseTopic, niche, status: 'PENDING' }
          });
        } else {
          console.warn(`Scheduler: RealtimeService not available for user ${user._id} during automated task.`);
        }

        console.log(`SIMULATION: Automated MCP task (OpID: ${operationId.toString()}) for user ${user._id} with effectiveTopic "${effectiveTopic}" would be processed here.`);

        await recordUsage(user._id, 'MCP_AUTOMATED_TRIGGER_REQUESTED', { effectiveTopic, baseTopic, niche, operationId: operationId.toString(), source: 'scheduler' });
      }
      if (actualEligibleCount > 0) {
        console.log(`Scheduler: Successfully initiated tasks for ${actualEligibleCount} active subscribers.`);
      } else {
        console.log('Scheduler: No users with active subscriptions were eligible for automated tasks in this run.');
      }

    } catch (error) {
      console.error('Scheduler: Error during automated MCP processing:', error.message, error.stack);
      await logActivity(null, 'AUTOMATION_SCHEDULER_ERROR', { error: error.message, stack: error.stack }, 'FAILURE');
    }
  }
}

module.exports = AutomationScheduler;
