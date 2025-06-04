const UsageHistory = require('../models/UsageHistory');

/**
 * Records a feature usage event for a user.
 * @param {mongoose.Types.ObjectId | String} userId - The ID of the user using the feature.
 * @param {String} featureType - The type of feature used (e.g., 'MCP_CONTENT_GENERATION').
 * @param {Object} details - Additional details about the usage (e.g., { duration: '30s', contentId: 'xyz' }).
 * @param {Number} cost - The cost associated with this usage, if applicable.
 * @param {mongoose.Types.ObjectId | String | null} relatedResourceId - Optional ID of a related resource.
 */
async function recordUsage(userId, featureType, details = {}, cost = 0, relatedResourceId = null) {
  if (!userId || !featureType) {
    console.error('Failed to record usage: userId and featureType are required.');
    return; // Or throw error, depending on desired handling
  }

  try {
    const usageEntry = new UsageHistory({
      userId,
      featureType,
      details,
      cost,
      relatedResourceId: relatedResourceId || null,
      timestamp: new Date(),
    });
    await usageEntry.save();
    // console.log(`Usage recorded: ${featureType} for user ${userId}`); // For debugging
  } catch (error) {
    // Log the error but do not let this break the main operation flow
    console.error(`Failed to record usage: ${featureType} for user ${userId}. Error: ${error.message}`);
  }
}

module.exports = { recordUsage };
