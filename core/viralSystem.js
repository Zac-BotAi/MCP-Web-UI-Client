// core/viralSystem.js
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const stream = require('stream'); // Required for fs.createReadStream

// Adjusted TEMP_DIR to be relative to the project root from core/
const TEMP_DIR = path.join(__dirname, '..', 'temp');
// CREDENTIALS_PATH for Google Drive
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

// Define serviceRegistry here
// Paths are relative to this file (core/viralSystem.js)
const serviceRegistry = {
  // Assuming 'services' directory is at project root, sibling to 'core'
  webExtractor: { module: '../services/webExtractor', type: 'local' },
  groq: { module: '../services/groq', type: 'api' },
  claude: { module: '../services/claude', url: 'https://claude.ai' }, // These might be placeholders if they are just URLs
  gemini: { module: '../services/gemini', url: 'https://gemini.google.com' },
  elevenlabs: { module: '../services/elevenlabs', url: 'https://elevenlabs.io' },
  runway: { module: '../services/runway', url: 'https://runway.ml' },
  canva: { module: '../services/canva', url: 'https://canva.com' },
  youtube: { module: '../services/youtube', url: 'https://youtube.com' },
  tiktok: { module: '../services/tiktok', url: 'https://tiktok.com' },
  instagram: { module: '../services/instagram', url: 'https://instagram.com' }
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
      await fs.mkdir(TEMP_DIR, { recursive: true });
      console.log('ViralContentSystem base initialized (Drive client, TempDir).');
    } catch (error) {
      console.error('Error during ViralContentSystem base initialization:', error);
      // Depending on severity, might want to re-throw or handle
      throw error; // For now, re-throw if base init fails
    }
  }

  async _loadService(name) {
    if (this.services[name]) return this.services[name];

    const config = this.serviceRegistry[name];
    if (!config) {
      console.error(`Service config for '${name}' not found in registry.`);
      throw new Error(`Unsupported service in VCS: ${name}`);
    }

    // Ensure module path is resolved correctly from the location of viralSystem.js
    // The paths in serviceRegistry are already relative to this file.
    const modulePath = config.module;

    try {
      const ServiceModule = require(modulePath);
      const serviceInstance = config.url ?
        new ServiceModule(name, config.url) : // Assuming constructor takes (name, url) for some
        new ServiceModule(); // Assuming default constructor for others

      if (serviceInstance.initialize) {
        await serviceInstance.initialize();
      }
      this.services[name] = serviceInstance;
      console.log(`Service '${name}' loaded for ViralContentSystem.`);
      return serviceInstance;
    } catch (error) {
      console.error(`Error loading service module '${name}' from path '${modulePath}':`, error);
      throw error; // Re-throw to indicate failure to load this service
    }
  }

  async initialize_dependent_services() {
    console.log('ViralContentSystem initializing dependent services...');
    this.services = {}; // Reset services object
    for (const name of Object.keys(this.serviceRegistry)) {
      try {
        await this._loadService(name);
      } catch (error) {
        console.error(`Failed to initialize service '${name}' in ViralContentSystem. Error: ${error.message}`);
        // Optional: Decide if one service failing should stop all.
        // For now, log and continue. Critical services might warrant a re-throw.
      }
    }
    console.log('ViralContentSystem dependent services initialization attempt complete.');
  }

  async authenticateGoogleDrive() {
    try {
      // Check if credentials file exists, warn if not.
      await fs.access(CREDENTIALS_PATH);
    } catch (e) {
      console.warn(`Warning: Google Drive credentials.json not found at ${CREDENTIALS_PATH}. Drive features will be unavailable.`);
      // Return null or throw, depending on how critical Drive is.
      // For now, let it proceed, and calls to uploadToDrive will fail.
      return null;
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    return google.drive({ version: 'v3', auth });
  }

  async uploadToDrive(filePath, fileName) {
    if (!this.driveClient) {
      console.error("Google Drive client not initialized. Cannot upload file.");
      throw new Error("Google Drive client not initialized. Ensure credentials.json is present and valid.");
    }

    // Resolve filePath: if not absolute, assume it's relative to TEMP_DIR
    const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.join(TEMP_DIR, filePath);

    try {
      await fs.access(absoluteFilePath);
    } catch (e) {
      console.error(`File not found for upload: ${absoluteFilePath}`);
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
      console.log(`Successfully generated Groq strategy for topic: ${topic}`);
    } catch (error) {
      console.error(`Error during Groq strategy generation for topic: ${topic}`, error);
      throw error;
    }

    // Step 2: Media creation
    try {
      if (!this.services.claude) throw new Error("Claude service not available/initialized.");
      assets.script = await this.services.claude.generateScript(strategy);
      console.log(`Successfully generated script with Claude for: ${strategy.title}`);
    } catch (error) {
      console.error(`Error generating script with Claude for strategy: ${strategy.title}`, error);
      throw error;
    }
    try {
      if (!this.services.runway) throw new Error("Runway service not available/initialized.");
      assets.image = await this.services.runway.generateImage(strategy.visualPrompt);
      console.log(`Successfully generated image with Runway for: ${strategy.title}`);
    } catch (error) {
      console.error(`Error generating image with Runway for strategy: ${strategy.title}`, error);
      throw error;
    }
    try {
      if (!this.services.elevenlabs) throw new Error("ElevenLabs service not available/initialized.");
      assets.audio = await this.services.elevenlabs.generateAudio(strategy.scriptSegment);
      console.log(`Successfully generated audio with ElevenLabs for: ${strategy.title}`);
    } catch (error) {
      console.error(`Error generating audio with ElevenLabs for strategy: ${strategy.title}`, error);
      throw error;
    }
    try {
      if (!this.services.runway) throw new Error("Runway service not available/initialized.");
      assets.video = await this.services.runway.generateVideo(strategy);
      console.log(`Successfully generated video with Runway for: ${strategy.title}`);
    } catch (error) {
      console.error(`Error generating video with Runway for strategy: ${strategy.title}`, error);
      throw error;
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
      // Assuming finalVideo.path is relative to TEMP_DIR or absolute
      console.log(`Successfully compiled video with Canva for: ${strategy.title}`);
    } catch (error) {
      console.error(`Error compiling video with Canva for strategy: ${strategy.title}`, error);
      throw error;
    }

    // Step 4: Save to Drive
    try {
      const sanitizedTitle = strategy.title.replace(/[^a-zA-Z0-9]/g, '_');
      // finalVideo.path from canva service might be absolute or relative to TEMP_DIR
      driveResult = await this.uploadToDrive(
        finalVideo.path,
        `${sanitizedTitle}-${contentId}.mp4`
      );
      console.log(`Successfully uploaded to Drive: ${driveResult.webViewLink}`);
    } catch (error) {
      console.error(`Error uploading to Drive for strategy: ${strategy.title}`, error);
      throw error;
    }

    // Step 5: Social distribution
    const socialServices = ['youtube', 'tiktok', 'instagram'];
    for(const serviceName of socialServices) {
        try {
            if (!this.services[serviceName]) throw new Error(`${serviceName} service not available/initialized.`);
            posts[serviceName] = await this.services[serviceName].postContent({
                videoPath: finalVideo.path, // Assuming finalVideo.path is what postContent expects
                title: strategy.title,
                description: strategy.description, // For YouTube
                caption: strategy.caption, // For TikTok/Instagram
                tags: strategy.hashtags
            });
            console.log(`Successfully posted to ${serviceName} for: ${strategy.title}`);
        } catch (error) {
            console.error(`Error posting to ${serviceName} for title: ${strategy.title}`, error);
            // Decide if to continue other posts or throw. For now, re-throw to halt.
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
      if (!this.services.webExtractor) {
        throw new Error("WebExtractorService not loaded or available.");
      }
      extractedText = await this.services.webExtractor.extractText(url);
      if (!extractedText) {
        console.error(`No content extracted from URL: ${url} (extractor returned null/empty)`);
        throw new Error(`No content could be extracted from URL: ${url}`);
      }
      console.log(`Successfully extracted text from URL: ${url}`);
    } catch (error) {
      console.error(`Error during web extraction from URL: ${url}`, error);
      throw error;
    }

    // Step 2: Content strategy with Groq using extracted text
    try {
      if (!this.services.groq) throw new Error("Groq service not available/initialized.");
      const topicForGroq = `Content strategy for URL: ${url}`;
      strategy = await this.services.groq.generateStrategy(topicForGroq, extractedText);
      console.log(`Successfully generated Groq strategy for URL: ${url}`);
    } catch (error) {
      console.error(`Error during Groq strategy generation for URL: ${url}`, error);
      throw error;
    }

    // Step 3: Media creation
    try {
      if (!this.services.claude) throw new Error("Claude service not available/initialized.");
      assets.script = await this.services.claude.generateScript(strategy);
      console.log(`Successfully generated script with Claude for URL content: ${strategy.title}`);
    } catch (error) {
      console.error(`Error generating script with Claude for URL strategy: ${strategy.title}`, error);
      throw error;
    }
    try {
      if (!this.services.runway) throw new Error("Runway service not available/initialized.");
      assets.image = await this.services.runway.generateImage(strategy.visualPrompt);
      console.log(`Successfully generated image with Runway for URL content: ${strategy.title}`);
    } catch (error) {
      console.error(`Error generating image with Runway for URL strategy: ${strategy.title}`, error);
      throw error;
    }
    try {
      if (!this.services.elevenlabs) throw new Error("ElevenLabs service not available/initialized.");
      assets.audio = await this.services.elevenlabs.generateAudio(strategy.scriptSegment);
      console.log(`Successfully generated audio with ElevenLabs for URL content: ${strategy.title}`);
    } catch (error) {
      console.error(`Error generating audio with ElevenLabs for URL strategy: ${strategy.title}`, error);
      throw error;
    }
    try {
      if (!this.services.runway) throw new Error("Runway service not available/initialized.");
      assets.video = await this.services.runway.generateVideo(strategy);
      console.log(`Successfully generated video with Runway for URL content: ${strategy.title}`);
    } catch (error) {
      console.error(`Error generating video with Runway for URL strategy: ${strategy.title}`, error);
      throw error;
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
      console.log(`Successfully compiled video with Canva for URL content: ${strategy.title}`);
    } catch (error) {
      console.error(`Error compiling video with Canva for URL strategy: ${strategy.title}`, error);
      throw error;
    }

    // Step 5: Save to Drive
    try {
      const sanitizedTitle = strategy.title.replace(/[^a-zA-Z0-9]/g, '_');
      driveResult = await this.uploadToDrive(
        finalVideoPath,
        `${sanitizedTitle}-${contentId}.mp4`
      );
      console.log(`Successfully uploaded to Drive for URL content: ${driveResult.webViewLink}`);
    } catch (error) {
      console.error(`Error uploading to Drive for URL strategy: ${strategy.title}`, error);
      throw error;
    }

    // Step 6: Social distribution
    const socialServices = ['youtube', 'tiktok', 'instagram'];
    for(const serviceName of socialServices) {
        try {
            if (!this.services[serviceName]) throw new Error(`${serviceName} service not available/initialized.`);
            // Assuming finalVideoPath is the correct path expected by postContent
            posts[serviceName] = await this.services[serviceName].postContent({
                videoPath: finalVideoPath,
                title: strategy.title,
                description: strategy.description,
                caption: strategy.caption,
                tags: strategy.hashtags
            });
            console.log(`Successfully posted to ${serviceName} for URL content: ${strategy.title}`);
        } catch (error) {
            console.error(`Error posting to ${serviceName} for URL title: ${strategy.title}`, error);
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
