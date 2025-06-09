// config/index.js
require('dotenv').config(); // Load .env file if present (primarily for development)

module.exports = {
  // Server Port
  port: parseInt(process.env.PORT, 10) || 3000,

  // Logging Level
  logLevel: process.env.LOG_LEVEL || 'info',

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // API Keys
  groqApiKey: process.env.GROQ_API_KEY,
  // Add other API keys here as they are identified, e.g., ELEVENLABS_API_KEY
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,


  // Google Cloud Credentials
  googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS, // Path to JSON file
  googleCredentialsJson: process.env.GOOGLE_CREDENTIALS_JSON, // JSON string

  // External Service URLs (defaults provided)
  // These will be used to populate serviceRegistry dynamically
  serviceUrls: {
    claude: process.env.CLAUDE_SERVICE_URL || 'https://claude.ai',
    gemini: process.env.GEMINI_SERVICE_URL || 'https://gemini.google.com',
    elevenlabs: process.env.ELEVENLABS_SERVICE_URL || 'https://elevenlabs.io',
    runway: process.env.RUNWAY_SERVICE_URL || 'https://runway.ml',
    canva: process.env.CANVA_SERVICE_URL || 'https://canva.com',
    // YouTube, TikTok, Instagram URLs are more for reference,
    // as their services might use Playwright or SDKs directly.
    // But can be included for consistency if needed.
    youtube: process.env.YOUTUBE_SERVICE_URL || 'https://youtube.com',
    tiktok: process.env.TIKTOK_SERVICE_URL || 'https://tiktok.com',
    instagram: process.env.INSTAGRAM_SERVICE_URL || 'https://instagram.com',
  },

  // Worker and Queue Settings
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 5,
  jobDefaultAttempts: parseInt(process.env.JOB_DEFAULT_ATTEMPTS, 10) || 3,
  jobDefaultBackoffDelay: parseInt(process.env.JOB_DEFAULT_BACKOFF_DELAY, 10) || 5000, // ms

  // API Rate Limiting Settings
  apiRateLimitWindowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  apiRateLimitMax: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 100,

  // Worker Rate Limiter Settings
  workerRateLimit: {
    max: parseInt(process.env.WORKER_RATE_LIMIT_MAX, 10) || 10, // Max jobs per duration
    duration: parseInt(process.env.WORKER_RATE_LIMIT_DURATION_MS, 10) || 60000, // Duration in milliseconds
  },

  // Add other configurations here as needed
  // Example: TEMP_DIR
  tempDir: process.env.TEMP_DIR || require('path').join(__dirname, '..', 'temp'), // Relative to project root

  // AI Input Settings
  aiInputMaxChars: parseInt(process.env.AI_INPUT_MAX_CHARS, 10) || 80000, // Max chars for AI input

  // Timeouts for External Interactions (in milliseconds)
  timeouts: {
    defaultExternalApiMs: parseInt(process.env.DEFAULT_EXTERNAL_API_TIMEOUT_MS, 10) || 30000,
    groqMs: parseInt(process.env.GROQ_TIMEOUT_MS, 10) || 30000,
    webExtractorNavigationMs: parseInt(process.env.WEB_EXTRACTOR_NAVIGATION_TIMEOUT_MS, 10) || 60000,
    newServiceAiRequestMs: parseInt(process.env.NEW_SERVICE_AI_REQUEST_TIMEOUT_MS, 10) || 60000,
    runwayVideoGenerationMs: parseInt(process.env.RUNWAY_VIDEO_GENERATION_TIMEOUT_MS, 10) || 180000, // 3 minutes
    runwayDownloadMs: parseInt(process.env.RUNWAY_DOWNLOAD_TIMEOUT_MS, 10) || 60000,       // 1 minute
  },

  debug: {
    savePlaywrightFailureArtifacts: (process.env.DEBUG_SAVE_PLAYWRIGHT_FAILURE_ARTIFACTS === 'true') || false,
  },
};
