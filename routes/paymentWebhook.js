const express = require('express');
const router = express.Router();
const PaymentHistory = require('../models/PaymentHistory');
const User = require('../models/User'); // To find user by custom_identifier if needed
const subscriptionService = require('../services/subscriptionService');
const { logActivity } = require('../services/activityLogService');
// RealtimeService will be accessed via req.app.get('realtimeService')

// POST /api/payments/webhook/ton_gateway - Simulated TON Payment Gateway Webhook
router.post('/ton_gateway', async (req, res) => {
  // --- Security Placeholder ---
  // In a real scenario, you MUST verify the webhook signature from the payment gateway.
  // This prevents attackers from sending fake successful payment notifications.
  // Example: const signature = req.headers['x-ton-gateway-signature'];
  // if (!verifySignature(req.body, signature, YOUR_GATEWAY_SECRET)) {
  //   console.warn('Invalid webhook signature received.');
  //   await logActivity(null, 'PAYMENT_WEBHOOK_SECURITY_FAILURE', { reason: 'Invalid signature', ip: req.ip }, 'FAILURE');
  //   return res.status(403).send('Invalid signature');
  // }
  console.log('Received webhook call from TON Gateway (Simulated - SIGNATURE NOT VERIFIED)');
  await logActivity(null, 'PAYMENT_WEBHOOK_RECEIVED', { gateway: 'ton_gateway', ip: req.ip, body: req.body }, 'SUCCESS');

  const {
    transaction_id, // Gateway's unique transaction ID
    user_identifier, // This should be the memo/comment you asked the user to include (their userId)
    amount_ton, // Amount in TON (or your chosen currency)
    status, // 'completed', 'failed', 'pending', etc.
    custom_data, // Any other data the gateway sends
  } = req.body;

  // Basic validation of incoming data
  if (!transaction_id || !user_identifier || !amount_ton || !status) {
    await logActivity(null, 'PAYMENT_WEBHOOK_INVALID_PAYLOAD', { transaction_id, user_identifier, reason: 'Missing essential fields' }, 'FAILURE');
    return res.status(400).json({ error: 'Missing essential fields in webhook payload' });
  }

  const userId = user_identifier; // Assuming user_identifier is the User's ObjectId string

  // 1. Check if user exists
  try {
    const user = await User.findById(userId);
    if (!user) {
        await logActivity(userId, 'PAYMENT_WEBHOOK_PROCESSING_FAILURE', { transaction_id, reason: 'User not found from identifier', user_identifier }, 'FAILURE');
        return res.status(404).json({ error: 'User specified in webhook not found' });
    }
  } catch (e) {
     await logActivity(userId, 'PAYMENT_WEBHOOK_PROCESSING_FAILURE', { transaction_id, reason: 'Error finding user', user_identifier, error: e.message }, 'FAILURE');
     return res.status(500).json({ error: 'Error finding user' });
  }


  // 2. Handle Payment Status
  if (status.toLowerCase() === 'completed' || status.toLowerCase() === 'success') { // Common success statuses
    try {
      // Idempotency: Check if this transactionId has already been processed
      let paymentRecord = await PaymentHistory.findOne({ transactionId: transaction_id, paymentGateway: 'ton_gateway' });
      if (paymentRecord && paymentRecord.status === 'COMPLETED') {
        console.log(`Transaction ${transaction_id} already processed and completed. Skipping.`);
        await logActivity(userId, 'PAYMENT_WEBHOOK_DUPLICATE_SUCCESS', { transaction_id }, 'SUCCESS');
        return res.status(200).json({ message: 'Transaction already processed' });
      }

      if (!paymentRecord) {
          paymentRecord = new PaymentHistory({
            userId,
            amount: parseFloat(amount_ton), // Ensure it's a number
            currency: 'TON', // Assuming TON
            paymentGateway: 'ton_gateway',
            transactionId: transaction_id,
            status: 'PENDING', // Initially pending, will be updated
            description: `Premium_24_7 Plan subscription via TON Gateway. User: ${userId}`,
            details: { webhookPayload: req.body, receivedAt: new Date() },
          });
      }

      paymentRecord.status = 'COMPLETED';
      paymentRecord.timestamp = new Date(); // Update timestamp to completion time
      await paymentRecord.save();

      await logActivity(userId, 'PAYMENT_WEBHOOK_SUCCESS', { transaction_id, amount: amount_ton, paymentId: paymentRecord._id }, 'SUCCESS', paymentRecord._id);

      // Update user's subscription status
      // Assuming 0.1 TON for 30 days for PREMIUM_24_7 plan
      const expectedAmount = 0.1; // Define this more dynamically in a real app
      if (parseFloat(amount_ton) >= expectedAmount) {
        await subscriptionService.updateUserSubscriptionStatus(userId, {
          planName: 'PREMIUM_24_7',
          durationDays: 30, // Example: 30 days for this plan
          paymentDate: paymentRecord.timestamp
        });

        // Send real-time message to user
        const realtimeService = req.app.get('realtimeService');
        if (realtimeService) {
          realtimeService.sendMessageToUser(userId, {
            type: 'SUBSCRIPTION_CONFIRMED',
            data: { plan: 'PREMIUM_24_7', transactionId: transaction_id, nextPaymentDate: (await User.findById(userId).select('nextPaymentDate')).nextPaymentDate }
          });
        }
         await logActivity(userId, 'USER_SUBSCRIPTION_ACTIVATED_VIA_WEBHOOK', { transaction_id, plan: 'PREMIUM_24_7' }, 'SUCCESS', paymentRecord._id);
      } else {
        // Amount paid doesn't match expected for the plan
        await logActivity(userId, 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH', { transaction_id, received: amount_ton, expected: expectedAmount }, 'FAILURE', paymentRecord._id);
        // Payment is recorded, but subscription might not be granted or needs manual review
        paymentRecord.description += ` Amount mismatch: received ${amount_ton}, expected ${expectedAmount}.`;
        paymentRecord.status = 'FAILED'; // Or a custom status like 'PARTIAL' or 'UNDERPAID'
        await paymentRecord.save();
      }

      res.status(200).json({ message: 'Webhook processed successfully' });

    } catch (error) {
      console.error('Error processing successful payment webhook:', error.message);
      let failureReason = error.message;
      if (error.code === 11000 && error.keyPattern && error.keyPattern.transactionId) { // Check if it's a duplicate key error on transactionId
          failureReason = 'Duplicate transactionId processing error';
          // This means the earlier check for existing paymentRecord might have failed or there was a race condition.
          // Log it and send 200 to avoid retries if the transaction was indeed processed.
          await logActivity(userId, 'PAYMENT_WEBHOOK_DUPLICATE_ERROR', { transaction_id, error: failureReason }, 'SUCCESS'); // Success to gateway, error for us
          return res.status(200).json({ message: 'Transaction likely already processed (duplicate error)' });
      }
      await logActivity(userId, 'PAYMENT_WEBHOOK_PROCESSING_ERROR_COMPLETED_STATUS', { transaction_id, error: failureReason }, 'FAILURE');
      res.status(500).json({ error: 'Internal server error while processing payment' });
    }
  } else {
    // Handle other statuses like 'failed', 'pending', 'refunded'
    try {
        let paymentRecord = await PaymentHistory.findOne({ transactionId: transaction_id, paymentGateway: 'ton_gateway' });
        if (!paymentRecord) {
            paymentRecord = new PaymentHistory({
                userId,
                amount: parseFloat(amount_ton),
                currency: 'TON',
                paymentGateway: 'ton_gateway',
                transactionId: transaction_id,
                status: status.toUpperCase(), // Use the gateway's status
                description: `Payment status update: ${status}. User: ${userId}`,
                details: { webhookPayload: req.body, receivedAt: new Date() }
            });
        } else {
            // If user paid, then it failed, then paid again successfully, this ensures the final status is not overwritten by a late 'failed' webhook.
            if (paymentRecord.status === 'COMPLETED') {
                 console.log(`Received a non-completed status '${status}' for already COMPLETED transaction ${transaction_id}. Ignoring.`);
                 await logActivity(userId, 'PAYMENT_WEBHOOK_LATE_NON_COMPLETED_IGNORED', { transaction_id, new_status: status, old_status: paymentRecord.status }, 'SUCCESS');
                 return res.status(200).json({ message: 'Late non-completed status for already completed transaction. Ignored.'});
            }
            paymentRecord.status = status.toUpperCase();
            paymentRecord.details.webhookPayload = req.body; // Update with latest payload
            paymentRecord.details.lastStatusUpdateAt = new Date();
        }

        await paymentRecord.save();
        await logActivity(userId, `PAYMENT_WEBHOOK_STATUS_${status.toUpperCase()}`, { transaction_id, status }, 'SUCCESS', paymentRecord._id);
        res.status(200).json({ message: `Webhook status ${status} processed` });

    } catch (error) {
        console.error(`Error processing non-completed payment webhook status '${status}':`, error.message);
        await logActivity(userId, `PAYMENT_WEBHOOK_PROCESSING_ERROR_${status.toUpperCase()}_STATUS`, { transaction_id, error: error.message }, 'FAILURE');
        res.status(500).json({ error: 'Internal server error while processing payment status' });
    }
  }
});

module.exports = router;
