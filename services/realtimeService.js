const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url'); // To parse query parameters

class RealtimeService {
  constructor(httpServer) {
    this.wss = new WebSocket.Server({ server: httpServer, path: '/ws/operations' });
    this.clients = new Map(); // Stores userId -> Set of WebSocket connections
    this.jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret';

    this.initialize();
    console.log('RealtimeService initialized, WebSocket server running on /ws/operations');
  }

  initialize() {
    this.wss.on('connection', (ws, req) => {
      const queryParams = url.parse(req.url, true).query;
      const token = queryParams.token;

      if (!token) {
        console.log('WebSocket connection attempt without token. Closing.');
        ws.terminate();
        return;
      }

      let userId;
      try {
        const decoded = jwt.verify(token, this.jwtSecret);
        userId = decoded.user.id; // Assuming your JWT payload has user.id
      } catch (err) {
        console.log('Invalid JWT for WebSocket connection. Closing.', err.message);
        ws.terminate();
        return;
      }

      if (!userId) {
        console.log('UserID not found in JWT. Closing connection.');
        ws.terminate();
        return;
      }

      console.log(`Client connected: ${userId}`);
      this.addClient(userId, ws);

      ws.on('message', (message) => {
        // For now, just log incoming messages. Could be used for client heartbeats or specific commands.
        console.log(`Received message from ${userId}: ${message}`);
        // Example: ws.send(JSON.stringify({ type: 'ack', message: 'Message received' }));
      });

      ws.on('close', () => {
        console.log(`Client disconnected: ${userId}`);
        this.removeClient(userId, ws);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error);
        this.removeClient(userId, ws); // Ensure client is removed on error
      });

      ws.send(JSON.stringify({ type: 'connection_ack', message: 'Successfully connected to realtime service.'}));
    });
  }

  addClient(userId, ws) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId).add(ws);
  }

  removeClient(userId, ws) {
    if (this.clients.has(userId)) {
      const userConnections = this.clients.get(userId);
      userConnections.delete(ws);
      if (userConnections.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  sendMessageToUser(userId, message) {
    const userConnections = this.clients.get(userId);
    if (userConnections && userConnections.size > 0) {
      // Message can be a string or an object. If an object, stringify it.
      const messageString = typeof message === 'string' ? message : JSON.stringify(message);
      let sentCount = 0;
      userConnections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageString);
          sentCount++;
        }
      });
      console.log(`Sent message to ${sentCount} connections for user ${userId}.`);
      return sentCount > 0;
    } else {
      console.log(`No active WebSocket connections found for user ${userId}. Message not sent.`);
      return false;
    }
  }

  broadcast(message) { // Optional: send to all connected clients
    const messageString = typeof message === 'string' ? message : JSON.stringify(message);
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageString);
      }
    });
    console.log('Broadcasted message to all clients.');
  }
}

module.exports = RealtimeService;
