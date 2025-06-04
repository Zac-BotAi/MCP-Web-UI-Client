// server.js - Enhanced Viral Content MCP System
const express = require('express');
// Playwright is used by services, but not directly in server.js top level
// const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
// Axios might be used by specific services, not necessarily top-level
// const axios = require('axios');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;
const SESSION_DIR = path.join(__dirname, 'sessions');
const TEMP_DIR = path.join(__dirname, 'temp');

// Service registry with enhanced capabilities
// Ensure module paths are correct and match the created files.
const serviceRegistry = {
  groq: { module: './services/groq', type: 'api' }, // Assumes GroqService doesn't extend BaseAIService or need URL
  claude: { module: './services/claude', url: 'https://claude.ai' },
  gemini: { module: './services/gemini', url: 'https://gemini.google.com' },
  elevenlabs: { module: './services/elevenlabs', url: 'https://elevenlabs.io' },
  runway: { module: './services/runaway', url: 'https://app.runwayml.com/video-tools' }, // Corrected path from runway.js to runaway.js
  canva: { module: './services/canva', url: 'https://canva.com' },
  youtube: { module: './services/youtube', url: 'https://studio.youtube.com' }, // Corrected URL from youtube.com to studio.youtube.com
  tiktok: { module: './services/tiktok', url: 'https://tiktok.com' },
  instagram: { module: './services/instagram', url: 'https://instagram.com' }
};

// Middleware
app.use(express.json());

class ViralContentSystem {
  constructor() {
    this.services = {};
    this.driveClient = null;
  }
  
  async initialize() {
    // Initialize Google Drive
    try {
      this.driveClient = await this.authenticateGoogleDrive();
      console.log('Google Drive authenticated.');
    } catch (error) {
      console.error('Failed to authenticate Google Drive:', error.message);
      // Depending on requirements, you might want to throw error or continue without Drive
    }
    
    // Create temp directory
    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log('Temp directory created.');
  }
  
  async authenticateGoogleDrive() {
    const keyFilePath = process.env.GOOGLE_CREDENTIALS || 'credentials.json';
    if (!await fs.access(keyFilePath).then(() => true).catch(() => false)) {
        throw new Error(`Google Drive credentials file not found at ${keyFilePath}. Please set GOOGLE_CREDENTIALS environment variable or place credentials.json in the root directory.`);
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    return google.drive({ version: 'v3', auth });
  }
  
  async uploadToDrive(filePath, fileName) {
    if (!this.driveClient) {
        console.warn('Google Drive client not initialized. Skipping upload.');
        return { webViewLink: 'drive_not_initialized' };
    }
    const media = { mimeType: 'application/octet-stream', body: require('fs').createReadStream(filePath) }; // Use require('fs') for createReadStream
    const res = await this.driveClient.files.create({
      requestBody: { name: fileName, parents: ['root'] }, // Consider making parent folder configurable
      media,
      fields: 'id, webViewLink'
    });
    console.log(`Uploaded ${fileName} to Drive. Link: ${res.data.webViewLink}`);
    return res.data;
  }
  
  async createViralContent(topic) {
    const contentId = uuidv4();
    console.log(`Starting viral content creation for topic: "${topic}", ID: ${contentId}`);
    
    // Step 1: Content strategy with Groq
    if (!this.services.groq) throw new Error("Groq service not loaded.");
    const strategy = await this.services.groq.generateStrategy(topic);
    console.log('Strategy generated:', strategy);
    
    // Step 2: Media creation
    // Ensure all services are loaded before calling them
    if (!this.services.claude) throw new Error("Claude service not loaded.");
    if (!this.services.runway) throw new Error("Runway service not loaded.");
    if (!this.services.elevenlabs) throw new Error("ElevenLabs service not loaded.");
    // Gemini is in serviceRegistry but not used in original assets, add if needed
    // if (!this.services.gemini) throw new Error("Gemini service not loaded.");


    const assets = {
      script: await this.services.claude.generateScript(strategy),
      // Assuming runway.generateImage exists or was intended for runway service
      // The original issue had runway.generateImage, but the runway.js only has generateVideo
      // For now, let's assume generateVideo can take a visualPrompt directly or we use a placeholder
      image: await this.services.runway.generateImage ? await this.services.runway.generateImage(strategy.visualPrompt) : { path: 'dummy-image.jpg', fileName: 'dummy-image.jpg' }, // Placeholder if generateImage not on runway
      audio: await this.services.elevenlabs.generateAudio(strategy.scriptSegment || strategy.title), // Use title if scriptSegment is empty
      video: await this.services.runway.generateVideo(strategy) // This was the original call
    };
    console.log('Assets created:', assets);
    
    // Step 3: Compile final content
    if (!this.services.canva) throw new Error("Canva service not loaded.");
    const finalVideo = await this.services.canva.compileVideo({
      ...assets,
      music: strategy.viralMusicPrompt
    });
    console.log('Video compiled:', finalVideo);
    
    // Step 4: Save to Drive
    let driveResult = { webViewLink: 'not_uploaded' };
    if (finalVideo && finalVideo.path) {
        driveResult = await this.uploadToDrive(
          finalVideo.path,
          `${strategy.title}-${contentId}.mp4`
        );
    } else {
        console.warn('Final video path is missing, skipping Drive upload.');
    }
    
    // Step 5: Social distribution
    if (!this.services.youtube) throw new Error("YouTube service not loaded.");
    if (!this.services.tiktok) throw new Error("TikTok service not loaded.");
    if (!this.services.instagram) throw new Error("Instagram service not loaded.");

    const posts = {};
    if (finalVideo && finalVideo.path) {
        posts.youtube = await this.services.youtube.postContent({
            video: finalVideo.path,
            title: strategy.title,
            description: strategy.description,
            tags: strategy.hashtags || []
        });
        posts.tiktok = await this.services.tiktok.postContent({
            video: finalVideo.path,
            caption: strategy.caption || strategy.title, // Use title if caption is empty
            tags: strategy.hashtags || []
        });
        posts.instagram = await this.services.instagram.postContent({
            video: finalVideo.path,
            caption: strategy.caption || strategy.title,
            tags: strategy.hashtags || []
        });
    } else {
        console.warn('Final video path is missing, skipping social distribution.');
        posts.youtube = { success: false, error: 'No video to post' };
        posts.tiktok = { success: false, error: 'No video to post' };
        posts.instagram = { success: false, error: 'No video to post' };
    }
    console.log('Social distribution results:', posts);
    
    return {
      contentId,
      strategy,
      driveLink: driveResult.webViewLink,
      posts
    };
  }
}

// Initialize system
const viralSystem = new ViralContentSystem();

// MCP Endpoint for viral content creation
app.post('/mcp/viral-content', async (req, res) => {
  const { id, method, params } = req.body;
  
  try {
    if (method !== 'create_viral_content') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found' },
        id
      });
    }
    
    const { topic } = params;
    if (!topic || typeof topic !== 'string' || topic.trim() === '') { // Added more robust topic validation
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32602, message: 'Missing or invalid topic parameter' },
        id
      });
    }
    
    const result = await viralSystem.createViralContent(topic);
    
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
  } catch (error) {
    console.error(`Viral content error: ${error.message}`, error.stack); // Added error.stack for more details
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: `Server error: ${error.message}` }, // Make error message more generic for client
      id
    });
  }
});

// Service loader
async function loadService(name) {
  if (viralSystem.services[name]) return viralSystem.services[name];
  
  const config = serviceRegistry[name];
  if (!config) throw new Error(`Unsupported service: ${name}`);
  
  const ServiceModule = require(config.module); // Changed variable name to avoid conflict
  // GroqService is instantiated differently if it's not a BaseAIService derivative
  const service = (config.type === 'api' && name === 'groq') ?
    new ServiceModule() :
    new ServiceModule(name, config.url); // Assumes other services take name and url
  
  if (service.initialize) {
    console.log(`Initializing service: ${name}`);
    await service.initialize();
  }
  viralSystem.services[name] = service;
  console.log(`Service ${name} loaded.`);
  return service;
}

// Initialize services
async function initializeServices() {
  console.log('Initializing all services...');
  for (const name of Object.keys(serviceRegistry)) {
    try {
      await loadService(name);
    } catch (error) {
      console.error(`Failed to load service ${name}: ${error.message}`, error.stack);
      // Decide if server should start if a service fails to load
      // For now, it will continue and throw error when service is used
    }
  }
  console.log('All services initialized (or attempted).');
}

// Start server
async function start() {
  await fs.mkdir(SESSION_DIR, { recursive: true }).catch(err => console.error("Error creating session dir:", err)); // Catch error for session dir
  await viralSystem.initialize(); // Initialize ViralContentSystem (which includes Drive auth and temp dir)
  await initializeServices(); // Initialize all registered services
  
  app.listen(port, () => {
    console.log(`Viral Content MCP running on port ${port}`);
    console.log(`Supported services: ${Object.keys(viralSystem.services).join(', ')}`);
  });
}

// Cleanup
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  for (const [name, service] of Object.entries(viralSystem.services)) {
    if (service.close) {
      try {
        console.log(`Closing service ${name}...`);
        await service.close();
      } catch (error) {
        console.error(`Error closing service ${name}: ${error.message}`);
      }
    }
  }
  process.exit();
});

start().catch(error => { // Catch errors during startup
  console.error("Failed to start server:", error.message, error.stack);
  process.exit(1);
});
