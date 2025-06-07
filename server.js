// server.js - Enhanced Viral Content MCP System
const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000; // Use PORT from environment or default to 3000
const SESSION_DIR = path.join(__dirname, 'sessions');
const TEMP_DIR = path.join(__dirname, 'temp');

// Service registry with enhanced capabilities
const serviceRegistry = {
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
    console.log('ViralContentSystem initializing...');
    // Initialize Google Drive
    this.driveClient = await this.authenticateGoogleDrive();
    console.log('Google Drive client authenticated.');
    
    // Create temp directory
    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log('Temp directory created.');
    console.log('ViralContentSystem initialized successfully.');
  }
  
  async authenticateGoogleDrive() {
    const authOptions = { scopes: ['https://www.googleapis.com/auth/drive'] };
    if (process.env.GOOGLE_CREDENTIALS) {
      try {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        authOptions.credentials = credentials;
        console.log('Using GOOGLE_CREDENTIALS environment variable for Google Drive authentication.');
      } catch (e) {
        console.error('Failed to parse GOOGLE_CREDENTIALS. Falling back to keyFile. Error:', e.message);
        authOptions.keyFile = 'credentials.json';
        console.log('Using credentials.json for Google Drive authentication (failed to parse GOOGLE_CREDENTIALS).');
      }
    } else {
      authOptions.keyFile = 'credentials.json';
      console.log('Using credentials.json for Google Drive authentication (GOOGLE_CREDENTIALS not set).');
    }
    const auth = new google.auth.GoogleAuth(authOptions);
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
    console.log(`--- Starting createViralContent for topic: ${topic} --- ${contentId}`);
    
    // Step 1: Content strategy with Groq
    console.log(`[${contentId}] [ViralWorkflow] Step 1: Generating content strategy with Groq...`);
    const strategy = await this.services.groq.generateStrategy(topic);
    console.log(`[${contentId}] [ViralWorkflow] Strategy generated successfully.`);
    
    // Step 2: Media creation
    console.log(`[${contentId}] [ViralWorkflow] Step 2: Generating media assets...`);
    console.log(`[${contentId}] [ViralWorkflow] Step 2a: Generating script with Claude...`);
    const script = await this.services.claude.generateScript(strategy);
    console.log(`[${contentId}] [ViralWorkflow] Script generated: ${script.substring(0, 50)}...`);

    console.log(`[${contentId}] [ViralWorkflow] Step 2b: Generating image with Runway...`);
    const image = await this.services.runway.generateImage(strategy.visualPrompt);
    console.log(`[${contentId}] [ViralWorkflow] Image generated: ${image.path}`);

    console.log(`[${contentId}] [ViralWorkflow] Step 2c: Generating audio with ElevenLabs...`);
    const audio = await this.services.elevenlabs.generateAudio(strategy.scriptSegment);
    console.log(`[${contentId}] [ViralWorkflow] Audio generated: ${audio.path}`);

    console.log(`[${contentId}] [ViralWorkflow] Step 2d: Generating video with Runway...`);
    const video = await this.services.runway.generateVideo(strategy);
    console.log(`[${contentId}] [ViralWorkflow] Video generated: ${video.path}`);

    const assets = { script, image, audio, video };
    console.log(`[${contentId}] [ViralWorkflow] All media assets generated.`);
    
    // Step 3: Compile final content
    console.log(`[${contentId}] [ViralWorkflow] Step 3: Compiling final content with Canva...`);
    const finalVideo = await this.services.canva.compileVideo({
      ...assets,
      music: strategy.viralMusicPrompt
    });
    console.log(`[${contentId}] [ViralWorkflow] Final video compiled: ${finalVideo.path}`);
    
    // Step 4: Save to Drive
    console.log(`[${contentId}] [ViralWorkflow] Step 4: Saving to Google Drive...`);
    const driveResult = await this.uploadToDrive(
      finalVideo.path, 
      `${strategy.title}-${contentId}.mp4`
    );
    console.log(`[${contentId}] [ViralWorkflow] Saved to Google Drive. Link: ${driveResult.webViewLink}`);
    
    // Step 5: Social distribution
    console.log(`[${contentId}] [ViralWorkflow] Step 5: Distributing to social platforms...`);
    const posts = {};

    console.log(`[${contentId}] [ViralWorkflow] Step 5a: Posting to YouTube...`);
    posts.youtube = await this.services.youtube.postContent({
      video: finalVideo.path,
      title: strategy.title,
      description: strategy.description,
      tags: strategy.hashtags
    });
    console.log(`[${contentId}] [ViralWorkflow] YouTube post successful. Post ID: ${posts.youtube.postId || posts.youtube}`); // Adjusted for actual return

    console.log(`[${contentId}] [ViralWorkflow] Step 5b: Posting to TikTok...`);
    posts.tiktok = await this.services.tiktok.postContent({
      video: finalVideo.path,
      caption: strategy.caption,
      tags: strategy.hashtags
    });
    console.log(`[${contentId}] [ViralWorkflow] TikTok post successful. Post ID: ${posts.tiktok.postId}`);

    console.log(`[${contentId}] [ViralWorkflow] Step 5c: Posting to Instagram...`);
    posts.instagram = await this.services.instagram.postContent({
      video: finalVideo.path,
      caption: strategy.caption,
      tags: strategy.hashtags
    });
    console.log(`[${contentId}] [ViralWorkflow] Instagram post successful. Post ID: ${posts.instagram.postId}`);

    console.log(`[${contentId}] [ViralWorkflow] Social distribution completed.`);
    console.log(`--- Finished createViralContent for topic: ${topic}. Content ID: ${contentId} ---`);
    
    return {
      contentId,
      strategy, // Consider removing this from final return if too large
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
    const { topic } = params || {}; // Ensure topic is available for logging, even if params is undefined
    console.error(`[ERROR] Viral content creation failed for topic '${topic}' (Request ID: ${id}):`, error);
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
  
  console.log(`Loading service module: ${name} from ${config.module}`);
  const Service = require(config.module);
  const service = config.url ? 
    new Service(name, config.url) : 
    new Service();
  console.log(`Service ${name} instantiated.`);
  
  if (service.initialize) {
    console.log(`Initializing service: ${name}...`);
    await service.initialize();
    console.log(`Service ${name} initialized successfully.`);
  }
  viralSystem.services[name] = service;
  return service;
}

// Initialize services
async function initializeServices() {
  console.log('Initializing all services...');
  for (const name of Object.keys(serviceRegistry)) {
    await loadService(name);
  }
  console.log('All services initialized.');
}

// Start server
async function start() {
  await fs.mkdir(SESSION_DIR, { recursive: true });
  await initializeServices();
  
  app.listen(PORT, () => { // Use capitalized PORT here
    console.log(`Viral Content MCP running on port ${PORT}`);
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