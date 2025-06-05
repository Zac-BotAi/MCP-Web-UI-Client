// config/redisConfig.js
module.exports = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  // password: process.env.REDIS_PASSWORD || undefined, // Uncomment if password is needed
  // Add other ioredis options if necessary, e.g., for TLS
};
