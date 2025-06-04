// server.js - Enhanced Viral Content MCP System
const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const PsychologyEngine = require('./services/psychology');

const app = express();
const port = 3000;
const SESSION_DIR = path.join(__dirname, 'sessions');
const TEMP_DIR = path.join(__dirname, 'temp');

// Service registry with enhanced capabilities
const serviceRegistry = {
  groq: { module: './services/groq', type: 'api' },
  claude: { module: './services/claude', url: 'https://claude.ai' },
  gemini: { module: './services/gemini', url: 'https://gemini.google.com' },
  elevenlabs: { module: './services/elevenlabs', url: 'https://elevenlabs.io' },
  runway: { module: './services/runaway.js', url: 'https://runway.ml' },
  canva: { module: './services/canva', url: 'https://canva.com' },
  youtube: { module: './services/youtube', url: 'https://youtube.com' },
  tiktok: { module: './services/tiktok', url: 'https://tiktok.com' },
  instagram: { module: './services/instagram', url: 'https://instagram.com' },
  new_service: { module: './services/new_service', url: 'https://new-ai-service.com' }
};

// Middleware
app.use(express.json());

class ViralContentSystem {
  constructor() {
    this.services = {};
    this.driveClient = null;
    this.psychologyEngine = new PsychologyEngine();
    this.appFolderId = null;
    this.appFolderName = process.env.GOOGLE_DRIVE_APP_FOLDER_NAME || 'MCP Content Uploads';
  }

  async _getOrCreateAppFolderId() {
    if (this.appFolderId) {
      return this.appFolderId;
    }

    try {
      console.log(`Searching for Google Drive folder: "${this.appFolderName}"`);
      const response = await this.driveClient.files.list({
        q: `name='${this.appFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (response.data.files.length > 0) {
        this.appFolderId = response.data.files[0].id;
        console.log(`Found existing Google Drive folder "${this.appFolderName}" with ID: ${this.appFolderId}`);
        return this.appFolderId;
      } else {
        console.log(`Google Drive folder "${this.appFolderName}" not found, creating it...`);
        const fileMetadata = {
          name: this.appFolderName,
          mimeType: 'application/vnd.google-apps.folder',
        };
        const folder = await this.driveClient.files.create({
          requestBody: fileMetadata,
          fields: 'id',
        });
        this.appFolderId = folder.data.id;
        console.log(`Created Google Drive folder "${this.appFolderName}" with ID: ${this.appFolderId}`);
        return this.appFolderId;
      }
    } catch (error) {
      console.error(`Error managing Google Drive folder: ${error.message}`);
      throw new Error(`Failed to get or create Google Drive app folder: ${error.message}`);
    }
  }
  
  async initialize() {
    // Initialize Google Drive
    this.driveClient = await this.authenticateGoogleDrive();
    await this._getOrCreateAppFolderId(); // Ensure app folder exists
    console.log(`Using Google Drive App Folder ID: ${this.appFolderId}`);
    
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
    if (!this.appFolderId) {
      console.warn('App folder ID not set for Google Drive upload. Defaulting to root. This should not happen if initialization was successful.');
      // Potentially throw an error here or ensure _getOrCreateAppFolderId is robust
    }
    const parents = this.appFolderId ? [this.appFolderId] : ['root'];

    const media = { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) };
    const res = await this.driveClient.files.create({
      requestBody: { name: fileName, parents: parents },
      media,
      fields: 'id, webViewLink'
    });
    console.log(`Uploaded file "${fileName}" to Google Drive folder ID: ${parents[0]}, File ID: ${res.data.id}`);
    return res.data;
  }
  
  async createViralContent(topic) {
    const contentId = uuidv4();
    
    // Get viral inputs from PsychologyEngine
    const viralInputs = this.psychologyEngine.getViralElements();
    let strategy, assets = {}, finalVideo, driveResult, posts = {};

    // Step 1: Content strategy with Groq
    try {
      strategy = await this.services.groq.generateStrategy(topic, viralInputs);
    } catch (error) {
      console.error(`Error in GroqService.generateStrategy: ${error.message}`);
      throw new Error(`Failed during Groq strategy generation: ${error.message}`);
    }
    
    // Step 2: Media creation
    try {
      assets.script = await this.services.claude.generateScript(strategy);
    } catch (error) {
      console.error(`Error in ClaudeService.generateScript: ${error.message}`);
      throw new Error(`Failed during Claude script generation: ${error.message}`);
    }
    try {
      assets.image = await this.services.runway.generateImage(strategy.visualPrompt);
    } catch (error) {
      console.error(`Error in RunwayService.generateImage: ${error.message}`);
      throw new Error(`Failed during Runway image generation: ${error.message}`);
    }
    try {
      assets.audio = await this.services.elevenlabs.generateAudio(strategy.scriptSegment);
    } catch (error) {
      console.error(`Error in ElevenLabsService.generateAudio: ${error.message}`);
      throw new Error(`Failed during ElevenLabs audio generation: ${error.message}`);
    }
    try {
      assets.video = await this.services.runway.generateVideo(strategy);
    } catch (error) {
      console.error(`Error in RunwayService.generateVideo: ${error.message}`);
      throw new Error(`Failed during Runway video generation: ${error.message}`);
    }
    
    // Step 3: Compile final content
    try {
      finalVideo = await this.services.canva.compileVideo({
        ...assets,
        music: strategy.viralMusicPrompt
      });
    } catch (error) {
      console.error(`Error in CanvaService.compileVideo: ${error.message}`);
      throw new Error(`Failed during Canva video compilation: ${error.message}`);
    }
    
    // Step 4: Save to Drive
    try {
      driveResult = await this.uploadToDrive(
        finalVideo.path,
        `${strategy.title}-${contentId}.mp4`
      );
    } catch (error) {
      console.error(`Error in uploadToDrive: ${error.message}`);
      throw new Error(`Failed during Google Drive upload: ${error.message}`);
    }
    
    // Step 5: Social distribution
    try {
      posts.youtube = await this.services.youtube.postContent({
        video: finalVideo.path,
        title: strategy.title,
        description: strategy.description,
        tags: strategy.hashtags
      });
    } catch (error) {
      console.error(`Error in YouTubeService.postContent: ${error.message}`);
      throw new Error(`Failed during YouTube posting: ${error.message}`);
    }
    try {
      posts.tiktok = await this.services.tiktok.postContent({
        video: finalVideo.path,
        caption: strategy.caption,
        tags: strategy.hashtags
      });
    } catch (error) {
      console.error(`Error in TikTokService.postContent: ${error.message}`);
      throw new Error(`Failed during TikTok posting: ${error.message}`);
    }
    try {
      posts.instagram = await this.services.instagram.postContent({
        video: finalVideo.path,
        caption: strategy.caption,
        tags: strategy.hashtags
      });
    } catch (error) {
      console.error(`Error in InstagramService.postContent: ${error.message}`);
      throw new Error(`Failed during Instagram posting: ${error.message}`);
    }
    
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
    if (method !== 'create_viral_content') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found' },
        id
      });
    }
    
    const { topic } = params;
    if (!topic) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32602, message: 'Missing topic parameter' },
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