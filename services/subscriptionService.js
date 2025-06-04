const User = require('../models/User');
const { logActivity } = require('./activityLogService');

class SubscriptionService {
  /**
   * Updates the user's subscription status, typically after a successful payment.
   * @param {String} userId - The ID of the user.
   * @param {Object} planDetails - Details about the plan.
   * @param {String} planDetails.planName - The name of the plan (e.g., 'PREMIUM_24_7').
   * @param {Number} planDetails.durationDays - Duration of the subscription period in days.
   * @param {Date} [planDetails.paymentDate] - The date of payment. Defaults to now.
   */
  async updateUserSubscriptionStatus(userId, planDetails) {
    if (!userId || !planDetails || !planDetails.planName || !planDetails.durationDays) {
      console.error('SubscriptionService: Missing userId or planDetails for update.');
      // Optionally log this failure if it's critical
      // await logActivity(userId || null, 'USER_SUBSCRIPTION_UPDATE_FAILURE', { reason: 'Missing parameters', providedPlanDetails: planDetails }, 'FAILURE');
      return false;
    }

    try {
      const user = await User.findById(userId);
      if (!user) {
        console.error(`SubscriptionService: User not found for ID ${userId}`);
        await logActivity(userId, 'USER_SUBSCRIPTION_UPDATE_FAILURE', { reason: 'User not found', plan: planDetails.planName }, 'FAILURE');
        return false;
      }

      const paymentDate = planDetails.paymentDate || new Date();
      const nextPaymentDate = new Date(paymentDate);
      nextPaymentDate.setDate(paymentDate.getDate() + planDetails.durationDays);

      user.mcpPlan = planDetails.planName;
      user.lastPaymentDate = paymentDate;
      user.nextPaymentDate = nextPaymentDate;
      // If the plan is a premium one, ensure automation can be enabled (user might toggle it themselves later)
      if (planDetails.planName === 'PREMIUM_24_7') {
          // user.is247AutomationEnabled = true; // Or let user enable it. For now, just update plan.
      }


      await user.save();
      await logActivity(userId, 'USER_SUBSCRIPTION_UPDATE_SUCCESS', {
        plan: user.mcpPlan,
        lastPaymentDate: user.lastPaymentDate,
        nextPaymentDate: user.nextPaymentDate
      }, 'SUCCESS');

      console.log(`Subscription updated for user ${userId} to ${user.mcpPlan}, next payment on ${user.nextPaymentDate}`);
      return true;

    } catch (error) {
      console.error(`SubscriptionService: Error updating subscription for user ${userId}: ${error.message}`);
      await logActivity(userId, 'USER_SUBSCRIPTION_UPDATE_FAILURE', {
        plan: planDetails.planName,
        error: error.message
      }, 'FAILURE');
      return false;
    }
  }

  /**
   * Checks the current subscription status of a user.
   * @param {String} userId - The ID of the user.
   * @returns {Object} An object like { isActive: Boolean, plan: String, nextPaymentDate: Date | null }
   */
  async checkSubscriptionStatus(userId) {
    if (!userId) {
      console.error('SubscriptionService: Missing userId for status check.');
      return { isActive: false, plan: 'FREE', nextPaymentDate: null, message: "User ID not provided" };
    }

    try {
      const user = await User.findById(userId).select('mcpPlan nextPaymentDate lastPaymentDate');
      if (!user) {
        return { isActive: false, plan: 'FREE', nextPaymentDate: null, message: "User not found" };
      }

      let isActive = false;
      if (user.mcpPlan === 'PREMIUM_24_7' && user.nextPaymentDate && user.nextPaymentDate > new Date()) {
        isActive = true;
      } else if (user.mcpPlan === 'PREMIUM_24_7' && user.nextPaymentDate && user.nextPaymentDate <= new Date()) {
        // Subscription expired, could optionally downgrade the user here or in a separate cron job
        // For now, just reflect status.
        console.log(`Subscription for user ${userId} (${user.mcpPlan}) expired on ${user.nextPaymentDate}.`);
        // await this.downgradeToExpired(userId); // Potential future method
      }


      return {
        isActive,
        plan: user.mcpPlan,
        nextPaymentDate: user.nextPaymentDate,
        lastPaymentDate: user.lastPaymentDate,
      };
    } catch (error) {
      console.error(`SubscriptionService: Error checking subscription for user ${userId}: ${error.message}`);
      // This is not a user action failure, but a system one if it occurs.
      // await logActivity(userId, 'SUBSCRIPTION_CHECK_SYSTEM_ERROR', { error: error.message }, 'FAILURE');
      return { isActive: false, plan: 'FREE', nextPaymentDate: null, message: "Error checking status" };
    }
  }

  // Optional: Method to handle downgrading after expiration
  // async downgradeToExpired(userId) {
  //   const user = await User.findById(userId);
  //   if (user && user.mcpPlan === 'PREMIUM_24_7' && user.nextPaymentDate <= new Date()) {
  //     user.mcpPlan = 'FREE'; // Or 'EXPIRED_PREMIUM'
  //     user.is247AutomationEnabled = false;
  //     await user.save();
  //     await logActivity(userId, 'USER_SUBSCRIPTION_EXPIRED_DOWNGRADED', { oldPlan: 'PREMIUM_24_7' }, 'SUCCESS');
  //     console.log(`User ${userId} downgraded due to subscription expiration.`);
  //   }
  // }
}

module.exports = new SubscriptionService(); // Export an instance
