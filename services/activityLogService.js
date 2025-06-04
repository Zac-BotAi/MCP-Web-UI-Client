const ActivityLog = require('../models/ActivityLog');

/**
 * Logs an activity for a user.
 * @param {mongoose.Types.ObjectId | String | null} userId - The ID of the user performing the action. Can be null if user is not authenticated/identified.
 * @param {String} actionType - The type of action performed (e.g., 'USER_LOGIN_SUCCESS').
 * @param {Object} details - Additional details about the activity (e.g., IP address, resource identifiers).
 * @param {String} status - The status of the action (e.g., 'SUCCESS', 'FAILURE').
 * @param {mongoose.Types.ObjectId | String | null} relatedResourceId - Optional ID of a related resource.
 */
async function logActivity(userId, actionType, details = {}, status = 'SUCCESS', relatedResourceId = null) {
  try {
    const logEntry = new ActivityLog({
      userId: userId || null, // Ensure userId is null if not provided, not undefined
      actionType,
      details,
      status,
      relatedResourceId: relatedResourceId || null, // Ensure null if not provided
      timestamp: new Date(), // Explicitly set for clarity, though default works
    });
    await logEntry.save();
    // console.log(`Activity logged: ${actionType} for user ${userId || 'N/A'}`); // For debugging
  } catch (error) {
    // Log the error but do not let this break the main operation flow
    console.error(`Failed to log activity: ${actionType} for user ${userId || 'N/A'}. Error: ${error.message}`);
    // In a more advanced system, this could go to a dedicated error tracking service
  }
}

module.exports = { logActivity };
