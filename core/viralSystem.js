// core/viralSystem.js
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const stream = require('stream'); // Required for fs.createReadStream
const config = require('../config'); // Added config require
const logger = require('../lib/logger'); // Added logger require

// TEMP_DIR is now sourced from config.tempDir
// CREDENTIALS_PATH is removed as we are using environment variables.

// Helper function for text truncation
function truncateText(text, maxLength) {
  if (typeof text !== 'string') {
    logger.warn({ inputTextType: typeof text }, 'truncateText received non-string input. Returning as is.');
    return text;
  }
  if (text.length <= maxLength) {
    return text;
  }
  logger.debug({ originalLength: text.length, maxLength }, `Truncating text to ${maxLength} characters.`);
  return text.substring(0, maxLength);
}

// Define serviceRegistry here
// Paths are relative to this file (core/viralSystem.js)

// List of services that are expected but their module files are missing
const missingServiceFiles = [
  'claude.js',
  'gemini.js',
  'elevenlabs.js',
  'canva.js',
  'tiktok.js',
  'instagram.js'
];

if (missingServiceFiles.length > 0) {
  logger.warn({
    disabledServices: missingServiceFiles.map(f => f.replace('.js', '')),
    missingFiles: missingServiceFiles.map(f => `services/${f}`)
  }, 'Some services are disabled due to missing module files. Corresponding entries in serviceRegistry will be commented out.');
}

const serviceRegistry = {
  // Assuming 'services' directory is at project root, sibling to 'core'
  webExtractor: { module: '../services/webExtractor', type: 'local' }, // Does not use a URL from config.serviceUrls
  groq: { module: '../services/groq', type: 'api' }, // Does not use a URL from config.serviceUrls for constructor
  // claude: { module: '../services/claude', url: config.serviceUrls.claude }, // File not found: services/claude.js
  // gemini: { module: '../services/gemini', url: config.serviceUrls.gemini }, // File not found: services/gemini.js
  // elevenlabs: { module: '../services/elevenlabs', url: config.serviceUrls.elevenlabs }, // File not found: services/elevenlabs.js
  runway: { module: '../services/runway', url: config.serviceUrls.runway },
  // canva: { module: '../services/canva', url: config.serviceUrls.canva }, // File not found: services/canva.js
  youtube: { module: '../services/youtube', url: config.serviceUrls.youtube }, // Assuming constructor might take a base URL
  // tiktok: { module: '../services/tiktok', url: config.serviceUrls.tiktok },     // File not found: services/tiktok.js
  // instagram: { module: '../services/instagram', url: config.serviceUrls.instagram } // File not found: services/instagram.js
};

class ViralContentSystem {
  constructor() {
    this.services = {};
    this.driveClient = null;
    // Service registry can be passed in or attached like this
    // If it's global to the module, this.serviceRegistry isn't strictly needed
    // but can be useful if registry could vary per instance (though not the case here).
    this.serviceRegistry = serviceRegistry;
  }

  async initialize() { // For base system resources (Drive, temp dirs)
    try {
      this.driveClient = await this.authenticateGoogleDrive();
      await fs.mkdir(config.tempDir, { recursive: true });
      logger.info('ViralContentSystem base initialized (Drive client, TempDir).');
    } catch (error) {
      logger.error({ err: error }, 'Error during ViralContentSystem base initialization');
      throw error;
    }
  }

  async _loadService(name) {
    if (this.services[name]) return this.services[name];

    const serviceConfig = this.serviceRegistry[name]; // Renamed to avoid conflict with global config
    if (!serviceConfig) {
      logger.error({ serviceName: name }, 'Service config not found in registry.');
      throw new Error(`Unsupported service in VCS: ${name}`);
    }

    const modulePath = serviceConfig.module;

    try {
      const ServiceModule = require(modulePath);
      const serviceInstance = serviceConfig.url ?
        new ServiceModule(name, serviceConfig.url) :
        new ServiceModule();

      if (serviceInstance.initialize) {
        await serviceInstance.initialize();
      }
      this.services[name] = serviceInstance;
      logger.info({ serviceName: name }, 'Service loaded for ViralContentSystem.');
      return serviceInstance;
    } catch (error) {
      logger.error({ err: error, serviceName: name, modulePath }, `Error loading service module`);
      throw error;
    }
  }

  async initialize_dependent_services() {
    logger.info('ViralContentSystem initializing dependent services...');
    this.services = {};
    for (const name of Object.keys(this.serviceRegistry)) {
      try {
        await this._loadService(name);
      } catch (error) {
        // Error is already logged in _loadService
        logger.error({ err: error, serviceName: name }, `Failed to initialize service in ViralContentSystem. Error: ${error.message}`);
      }
    }
    logger.info('ViralContentSystem dependent services initialization attempt complete.');
  }

  async authenticateGoogleDrive() {
    let auth;
    const scopes = ['https://www.googleapis.com/auth/drive'];

    if (config.googleCredentialsJson) {
      logger.info('Attempting to use Google Drive credentials from GOOGLE_CREDENTIALS_JSON (via config).');
      try {
        const credentials = JSON.parse(config.googleCredentialsJson);
        auth = new google.auth.GoogleAuth({ credentials, scopes });
      } catch (error) {
        logger.error({ err: error }, 'Failed to parse GOOGLE_CREDENTIALS_JSON (from config)');
        throw new Error('Malformed GOOGLE_CREDENTIALS_JSON (from config). Please check the environment variable or config setup.');
      }
    } else if (config.googleApplicationCredentials) {
      logger.info('Using Google Drive credentials from GOOGLE_APPLICATION_CREDENTIALS (via config).');
      auth = new google.auth.GoogleAuth({ scopes }); // Relies on GOOGLE_APPLICATION_CREDENTIALS env var being set
    } else {
      logger.error('Google Drive credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_JSON.');
      throw new Error('Google Drive credentials not configured. Unable to initialize Drive client.');
    }

    return google.drive({ version: 'v3', auth });
  }

  async uploadToDrive(filePath, fileName) {
    if (!this.driveClient) {
      logger.error("Google Drive client not initialized. Cannot upload file.");
      throw new Error("Google Drive client not initialized. Ensure credentials are set and valid.");
    }

    const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.join(config.tempDir, filePath);

    try {
      await fs.access(absoluteFilePath);
    } catch (e) {
      logger.error({ err: e, filePath: absoluteFilePath }, 'File not found for upload');
      throw new Error(`File not found for upload: ${absoluteFilePath}`);
    }

    const media = {
      mimeType: 'application/octet-stream', // Or determine dynamically
      body: fs.createReadStream(absoluteFilePath)
    };
    const res = await this.driveClient.files.create({
      requestBody: { name: fileName, parents: ['root'] }, // Consider making parent configurable
      media,
      fields: 'id, webViewLink'
    });
    return res.data;
  }

  async createViralContent(topic) {
    const contentId = uuidv4();
    let strategy, assets = {}, finalVideo, driveResult, posts = {};

    // Step 1: Content strategy with Groq
    try {
      if (!this.services.groq) throw new Error("Groq service not available/initialized.");
      strategy = await this.services.groq.generateStrategy(topic);
      logger.debug({ topic, strategyTitle: strategy.title }, `Groq strategy generated`);
    } catch (error) {
      logger.error({ err: error, topic, step: 'GroqStrategy' }, 'Error during Groq strategy generation');
      throw error;
    }

    // Step 2: Media creation
    const mediaCreationSteps = [
      { name: 'ClaudeScript', service: 'claude', func: 'generateScript', input: strategy, outputField: 'script' },
      { name: 'RunwayImage', service: 'runway', func: 'generateImage', input: strategy.visualPrompt, outputField: 'image' },
      { name: 'ElevenLabsAudio', service: 'elevenlabs', func: 'generateAudio', input: strategy.scriptSegment, outputField: 'audio' },
      { name: 'RunwayVideo', service: 'runway', func: 'generateVideo', input: strategy, outputField: 'video' }
    ];

    for (const step of mediaCreationSteps) {
      try {
        if (!this.services[step.service]) throw new Error(`${step.service} service not available/initialized.`);
        assets[step.outputField] = await this.services[step.service][step.func](step.input);
        logger.debug({ strategyTitle: strategy.title, step: step.name }, `${step.name} generated`);
      } catch (error) {
        logger.error({ err: error, strategyTitle: strategy.title, step: step.name }, `Error during ${step.name}`);
        throw error;
      }
    }

    // Step 3: Compile final content
    try {
      if (!this.services.canva) throw new Error("Canva service not available/initialized.");
      finalVideo = await this.services.canva.compileVideo({
        ...assets,
        music: strategy.viralMusicPrompt,
        title: strategy.title,
        caption: strategy.caption,
      });
      logger.debug({ strategyTitle: strategy.title }, `Video compiled with Canva`);
    } catch (error) {
      logger.error({ err: error, strategyTitle: strategy.title, step: 'CanvaCompilation' }, 'Error compiling video with Canva');
      throw error;
    }

    // Step 4: Save to Drive
    try {
      const sanitizedTitle = strategy.title.replace(/[^a-zA-Z0-9]/g, '_');
      driveResult = await this.uploadToDrive(
        finalVideo.path,
        `${sanitizedTitle}-${contentId}.mp4`
      );
      logger.info({ strategyTitle: strategy.title, driveLink: driveResult.webViewLink }, `Content uploaded to Drive`);
    } catch (error) {
      logger.error({ err: error, strategyTitle: strategy.title, step: 'DriveUpload' }, 'Error uploading to Drive');
      throw error;
    }

    // Step 5: Social distribution
    const socialServices = ['youtube', 'tiktok', 'instagram'];
    for(const serviceName of socialServices) {
        try {
            if (!this.services[serviceName]) throw new Error(`${serviceName} service not available/initialized.`);
            posts[serviceName] = await this.services[serviceName].postContent({
                videoPath: finalVideo.path,
                title: strategy.title,
                description: strategy.description,
                caption: strategy.caption,
                tags: strategy.hashtags
            });
            logger.info({ strategyTitle: strategy.title, service: serviceName }, `Content posted to ${serviceName}`);
        } catch (error) {
            logger.error({ err: error, strategyTitle: strategy.title, service: serviceName, step: 'SocialDistribution'}, `Error posting to ${serviceName}`);
            throw error;
        }
    }

    return {
      contentId,
      strategy,
      driveLink: driveResult.webViewLink,
      posts
    };
  }

  async createViralContentFromUrl(url, userId) {
    const contentId = uuidv4();
    let extractedText, strategy, assets = {}, finalVideoPath, driveResult, posts = {};

    // Step 1: Extract text from URL
    try {
      if (!this.services.webExtractor) throw new Error("WebExtractorService not loaded or available.");
      extractedText = await this.services.webExtractor.extractText(url);
      if (!extractedText) {
        logger.warn({ url }, 'No content extracted from URL (extractor returned null/empty)');
        throw new Error(`No content could be extracted from URL: ${url}`);
      }
      logger.debug({ url, originalTextLength: extractedText.length }, `Text extracted from URL`);
    } catch (error) {
      logger.error({ err: error, url, step: 'WebExtraction' }, `Error during web extraction from URL`);
      throw error;
    }

    // Process text for AI: Truncate if necessary
    let processedTextForAI = extractedText;
    if (extractedText && extractedText.length > config.aiInputMaxChars) {
      processedTextForAI = truncateText(extractedText, config.aiInputMaxChars);
      logger.warn({
        originalLength: extractedText.length,
        truncatedLength: processedTextForAI.length,
        maxLength: config.aiInputMaxChars,
        url: url
      }, 'Extracted text from URL was truncated before sending to AI strategy generator.');
    }

    // Step 2: Content strategy with Groq using processed (potentially truncated) text
    try {
      if (!this.services.groq) throw new Error("Groq service not available/initialized.");
      const topicForGroq = `Content strategy for URL: ${url}`; // Topic can still be the full URL for context
      strategy = await this.services.groq.generateStrategy(topicForGroq, processedTextForAI);
      logger.debug({ url, strategyTitle: strategy.title, processedTextLength: processedTextForAI.length }, `Groq strategy generated for URL content`);
    } catch (error) {
      logger.error({ err: error, url, step: 'GroqStrategyForURL' }, 'Error during Groq strategy generation for URL');
      throw error;
    }

    // Step 3: Media creation (same loop as createViralContent, context varies)
    const mediaCreationStepsUrl = [
        { name: 'ClaudeScript', service: 'claude', func: 'generateScript', input: strategy, outputField: 'script' },
        { name: 'RunwayImage', service: 'runway', func: 'generateImage', input: strategy.visualPrompt, outputField: 'image' },
        { name: 'ElevenLabsAudio', service: 'elevenlabs', func: 'generateAudio', input: strategy.scriptSegment, outputField: 'audio' },
        { name: 'RunwayVideo', service: 'runway', func: 'generateVideo', input: strategy, outputField: 'video' }
      ];

    for (const step of mediaCreationStepsUrl) {
        try {
          if (!this.services[step.service]) throw new Error(`${step.service} service not available/initialized.`);
          assets[step.outputField] = await this.services[step.service][step.func](step.input);
          logger.debug({ strategyTitle: strategy.title, step: step.name, context: 'URL_Based' }, `${step.name} generated for URL content`);
        } catch (error) {
          logger.error({ err: error, strategyTitle: strategy.title, step: step.name, context: 'URL_Based' }, `Error during ${step.name} for URL content`);
          throw error;
        }
    }

    // Step 4: Compile final content
    try {
      if (!this.services.canva) throw new Error("Canva service not available/initialized.");
      finalVideoPath = await this.services.canva.compileVideo({
        ...assets,
        music: strategy.viralMusicPrompt,
        title: strategy.title,
        caption: strategy.caption
      });
      logger.debug({ strategyTitle: strategy.title, context: 'URL_Based' }, `Video compiled with Canva for URL content`);
    } catch (error) {
      logger.error({ err: error, strategyTitle: strategy.title, step: 'CanvaCompilationURL', context: 'URL_Based' }, 'Error compiling video with Canva for URL content');
      throw error;
    }

    // Step 5: Save to Drive
    try {
      const sanitizedTitle = strategy.title.replace(/[^a-zA-Z0-9]/g, '_');
      driveResult = await this.uploadToDrive(
        finalVideoPath,
        `${sanitizedTitle}-${contentId}.mp4`
      );
      logger.info({ strategyTitle: strategy.title, driveLink: driveResult.webViewLink, context: 'URL_Based' }, `Content from URL uploaded to Drive`);
    } catch (error) {
      logger.error({ err: error, strategyTitle: strategy.title, step: 'DriveUploadURL', context: 'URL_Based' }, 'Error uploading to Drive for URL content');
      throw error;
    }

    // Step 6: Social distribution
    const socialServices = ['youtube', 'tiktok', 'instagram'];
    for(const serviceName of socialServices) {
        try {
            if (!this.services[serviceName]) throw new Error(`${serviceName} service not available/initialized.`);
            posts[serviceName] = await this.services[serviceName].postContent({
                videoPath: finalVideoPath,
                title: strategy.title,
                description: strategy.description,
                caption: strategy.caption,
                tags: strategy.hashtags
            });
            logger.info({ strategyTitle: strategy.title, service: serviceName, context: 'URL_Based' }, `Content from URL posted to ${serviceName}`);
        } catch (error) {
            logger.error({ err: error, strategyTitle: strategy.title, service: serviceName, step: 'SocialDistributionURL', context: 'URL_Based'}, `Error posting content from URL to ${serviceName}`);
            throw error;
        }
    }

    return {
      contentId,
      strategy,
      driveLink: driveResult.webViewLink,
      posts
    };
  }
}

module.exports = { ViralContentSystem };
