const express = require('express');
const mongoose = require('mongoose');
const http = require('http'); // Required for WebSocket server
const authRoutes = require('./routes/auth');
const credentialRoutes = require('./routes/credentials');
const activityLogRoutes = require('./routes/activity');
const paymentHistoryRoutes = require('./routes/paymentHistory');
const usageHistoryRoutes = require('./routes/usageHistory');
const automationSettingsRoutes = require('./routes/automationSettings');
const mcpOperationsRoutes = require('./routes/mcpOperations');
const paymentInitiationRoutes = require('./routes/paymentInitiation'); // Import payment initiation routes
const paymentWebhookRoutes = require('./routes/paymentWebhook'); // Import payment webhook routes
const AutomationScheduler = require('./services/automationScheduler');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());

// Database connection placeholder
// For local development, you might replace 'mongodb://localhost:27017/telegram_mini_app'
// with your actual MongoDB connection string.
// For production, use environment variables.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/telegram_mini_app_auth';

mongoose.connect(MONGO_URI)
.then(() => console.log('MongoDB Connected to telegram_mini_app_auth'))
.catch(err => {
  console.error('MongoDB connection error:', err.message);
  // Exit process with failure in case of database connection error
  process.exit(1);
});

// Routes
app.use('/auth', authRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/activity', activityLogRoutes);
app.use('/api/payments', paymentHistoryRoutes); // Existing payment history (GET records, POST manual record)
app.use('/api/payments/initiate', paymentInitiationRoutes); // For users to get payment details
app.use('/api/payments/webhook', paymentWebhookRoutes); // For gateway callbacks
app.use('/api/usage', usageHistoryRoutes);
app.use('/api/automation', automationSettingsRoutes);
app.use('/api/mcp', mcpOperationsRoutes);

// Test route for RealtimeService
app.post('/api/test/send-realtime-message', express.json(), (req, res) => {
  const { userId, message } = req.body;
  if (!userId || !message) {
    return res.status(400).json({ msg: 'userId and message are required' });
  }

  const realtimeService = app.get('realtimeService');
  if (realtimeService) {
    const sent = realtimeService.sendMessageToUser(userId, message);
    if (sent) {
      res.status(200).json({ msg: 'Message sent successfully via WebSocket.' });
    } else {
      res.status(404).json({ msg: 'User not connected or message sending failed.' });
    }
  } else {
    res.status(500).json({ msg: 'RealtimeService not available.' });
  }
});

app.get('/', (req, res) => {
  res.send('Telegram Mini-App Backend: Auth, Credentials, Activity & Realtime Service');
});

const PORT = process.env.AUTH_PORT || 3001;
// app.listen(PORT, () => { // Original listen
//   console.log(`Authentication server running on port ${PORT}`);
// });

// WebSocket service will be attached to 'server'
const RealtimeService = require('./services/realtimeService');
const realtimeServiceInstance = new RealtimeService(server);
app.set('realtimeService', realtimeServiceInstance); // Expose RealtimeService for routes

// Initialize and start Automation Scheduler
const scheduler = new AutomationScheduler(realtimeServiceInstance);
scheduler.start(); // Uses default cron expression (e.g., every 5 minutes)
// To stop it gracefully on shutdown, you might add:
// process.on('SIGINT', () => scheduler.stop());
// process.on('SIGTERM', () => scheduler.stop());


server.listen(PORT, () => {
  console.log(`Server (HTTP & WebSocket) running on port ${PORT}`);
  console.log('Automation scheduler initialized.'); // Log that scheduler setup was attempted
});
