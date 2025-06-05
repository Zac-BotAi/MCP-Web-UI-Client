// server.js - Enhanced Viral Content MCP System
const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;
const SESSION_DIR = path.join(__dirname, 'sessions');
const TEMP_DIR = path.join(__dirname, 'temp');

// Service registry with enhanced capabilities
const serviceRegistry = {
  webExtractor: { module: './services/webExtractor', type: 'local' }, // Added WebExtractorService
  groq: { module: './services/groq', type: 'api' },
  claude: { module: './services/claude', url: 'https://claude.ai' },
  gemini: { module: './services/gemini', url: 'https://gemini.google.com' },
  elevenlabs: { module: './services/elevenlabs', url: 'https://elevenlabs.io' },
  runway: { module: './services/runway', url: 'https://runway.ml' },
  canva: { module: './services/canva', url: 'https://canva.com' },
  youtube: { module: './services/youtube', url: 'https://youtube.com' },
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
    this.driveClient = await this.authenticateGoogleDrive();
    
    // Create temp directory
    await fs.mkdir(TEMP_DIR, { recursive: true });
  }
  
  async authenticateGoogleDrive() {
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json',
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    return google.drive({ version: 'v3', auth });
  }
  
  async uploadToDrive(filePath, fileName) {
    const media = { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) };
    const res = await this.driveClient.files.create({
      requestBody: { name: fileName, parents: ['root'] },
      media,
      fields: 'id, webViewLink'
    });
    return res.data;
  }
  
  async createViralContent(topic) {
    const contentId = uuidv4();
    
    // Step 1: Content strategy with Groq
    const strategy = await this.services.groq.generateStrategy(topic);
    
    // Step 2: Media creation
    const assets = {
      script: await this.services.claude.generateScript(strategy),
      image: await this.services.runway.generateImage(strategy.visualPrompt),
      audio: await this.services.elevenlabs.generateAudio(strategy.scriptSegment),
      video: await this.services.runway.generateVideo(strategy)
    };
    
    // Step 3: Compile final content
    const finalVideo = await this.services.canva.compileVideo({
      ...assets,
      music: strategy.viralMusicPrompt
    });
    
    // Step 4: Save to Drive
    const driveResult = await this.uploadToDrive(
      finalVideo.path, 
      `${strategy.title}-${contentId}.mp4`
    );
    
    // Step 5: Social distribution
    const posts = {
      youtube: await this.services.youtube.postContent({
        video: finalVideo.path,
        title: strategy.title,
        description: strategy.description,
        tags: strategy.hashtags
      }),
      tiktok: await this.services.tiktok.postContent({
        video: finalVideo.path,
        caption: strategy.caption,
        tags: strategy.hashtags
      }),
      instagram: await this.services.instagram.postContent({
        video: finalVideo.path,
        caption: strategy.caption,
        tags: strategy.hashtags
      })
    };
    
    return {
      contentId,
      strategy,
      driveLink: driveResult.webViewLink,
      posts
    };
  }

  async createViralContentFromUrl(url, userId) { // userId is for future use
    const contentId = uuidv4();

    // Step 1: Extract text from URL
    if (!this.services.webExtractor) {
      throw new Error("WebExtractorService not loaded or available.");
    }
    const extractedText = await this.services.webExtractor.extractText(url);
    if (!extractedText) {
      throw new Error(`Failed to extract text from URL: ${url}`);
    }

    // Step 2: Content strategy with Groq using extracted text
    // Passing a generic topic, and the extracted text as urlContent
    const strategy = await this.services.groq.generateStrategy(
      `Content strategy for URL: ${url}`,
      extractedText
    );

    // Step 3: Media creation (mirroring createViralContent)
    const assets = {
      script: await this.services.claude.generateScript(strategy),
      image: await this.services.runway.generateImage(strategy.visualPrompt),
      audio: await this.services.elevenlabs.generateAudio(strategy.scriptSegment),
      video: await this.services.runway.generateVideo(strategy) // Assuming runway can take the full strategy
    };

    // Step 4: Compile final content
    const finalVideoPath = await this.services.canva.compileVideo({ // Assuming compileVideo returns a path directly
      ...assets,
      music: strategy.viralMusicPrompt,
      title: strategy.title, // Pass title for Canva if needed
      caption: strategy.caption // Pass caption for Canva if needed
    });

    // Step 5: Save to Drive
    const driveResult = await this.uploadToDrive(
      finalVideoPath, // Use the direct path from canva.compileVideo
      `${strategy.title.replace(/[^a-zA-Z0-9]/g, '_')}-${contentId}.mp4` // Sanitize title for filename
    );

    // Step 6: Social distribution
    const posts = {
      youtube: await this.services.youtube.postContent({
        videoPath: finalVideoPath,
        title: strategy.title,
        description: strategy.description,
        tags: strategy.hashtags
      }),
      tiktok: await this.services.tiktok.postContent({
        videoPath: finalVideoPath,
        caption: strategy.caption,
        tags: strategy.hashtags
      }),
      instagram: await this.services.instagram.postContent({
        videoPath: finalVideoPath,
        caption: strategy.caption,
        tags: strategy.hashtags
      })
    };

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
viralSystem.initialize();

// MCP Endpoint for viral content creation
app.post('/mcp/viral-content', async (req, res) => {
  const { id, method, params } = req.body;
  
  try {
    let result;
    if (method === 'create_viral_content' && params.topic) {
      result = await viralSystem.createViralContent(params.topic);
    } else if (method === 'create_viral_content_from_url' && params.url) {
      // Assuming userId might come from session or a decoded token in a real app
      // For now, passing null or a placeholder if not provided in params
      result = await viralSystem.createViralContentFromUrl(params.url, params.userId || null);
    } else {
      let errorMessage = 'Method not found or missing required parameters.';
      if (method === 'create_viral_content' && !params.topic) {
        errorMessage = 'Missing topic parameter for create_viral_content.';
      } else if (method === 'create_viral_content_from_url' && !params.url) {
        errorMessage = 'Missing url parameter for create_viral_content_from_url.';
      }
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32602, message: errorMessage },
        id
      });
    }
    
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
  } catch (error) {
    console.error(`Viral content error: ${error.message}`);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: error.message },
      id
    });
  }
});

// Service loader
async function loadService(name) {
  if (viralSystem.services[name]) return viralSystem.services[name];
  
  const config = serviceRegistry[name];
  if (!config) throw new Error(`Unsupported service: ${name}`);
  
  const Service = require(config.module);
  const service = config.url ? 
    new Service(name, config.url) : 
    new Service();
  
  if (service.initialize) await service.initialize();
  viralSystem.services[name] = service;
  return service;
}

// Initialize services
async function initializeServices() {
  for (const name of Object.keys(serviceRegistry)) {
    await loadService(name);
  }
}

// Start server
async function start() {
  await fs.mkdir(SESSION_DIR, { recursive: true });
  await initializeServices();
  
  app.listen(port, () => {
    console.log(`Viral Content MCP running on port ${port}`);
    console.log(`Supported services: ${Object.keys(serviceRegistry).join(', ')}`);
  });
}

// Cleanup
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  for (const service of Object.values(viralSystem.services)) {
    if (service.close) await service.close();
  }
  process.exit();
});

start();