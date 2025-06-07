// server.js - Enhanced Viral Content MCP System
const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./utils/supabaseClient'); // Import Supabase client
const { sendAdminNotification } = require('./utils/telegramNotifier'); // Import Telegram Notifier

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

// --- Auth Middleware ---
const authMiddleware = async (req, res, next) => {
  if (!supabase) {
    // This check is important. If Supabase isn't up, auth (and notifier logging to DB) won't work.
    // Notifier will still try to send to Telegram if Telegram ENV VARS are set.
    return res.status(503).json({ error: 'Supabase client not initialized. Cannot authenticate.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided or invalid format.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Token not found after Bearer.' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.warn('[AuthMiddleware] Supabase getUser error:', error.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.', details: error.message });
    }

    if (!user) {
      console.warn('[AuthMiddleware] No user found for token, though no error was reported by Supabase.');
      return res.status(401).json({ error: 'Unauthorized: User not found for token.' });
    }

    req.user = user; // Attach user object to the request
    // console.log('[AuthMiddleware] User authenticated:', user.id, user.email);
    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    console.error('[AuthMiddleware] Exception:', error.message, error.stack);
    res.status(500).json({ error: 'Internal server error during authentication.' });
  }
};

// MCP Endpoint for viral content creation
app.post('/mcp/viral-content', authMiddleware, async (req, res) => {
  // req.user is now available, e.g., req.user.id
  console.log(`[ViralContent] Request received from authenticated user: ${req.user.id}`);
  const { id: requestId, method, params } = req.body; // Renamed 'id' from req.body to 'requestId'
  
  try {
    if (method !== 'create_viral_content') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found' },
        id: requestId // Use requestId for JSONRPC response
      });
    }
    
    const { topic } = params;
    if (!topic) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32602, message: 'Missing topic parameter' },
        id: requestId // Use requestId for JSONRPC response
      });
    }
    
    // Potential future use of req.user:
    // const result = await viralSystem.createViralContent(topic, req.user.id);
    const result = await viralSystem.createViralContent(topic);
    
    res.json({
      jsonrpc: '2.0',
      result,
      id: requestId // Use requestId for JSONRPC response
    });
  } catch (error) {
    const { topic } = params || {};
    const errorMessage = `[ERROR] Viral content creation failed for topic '${topic}' (User: ${req.user.id}, Request ID: ${requestId}): ${error.message}`;
    console.error(errorMessage, error.stack);
    // Send admin notification for critical error
    await sendAdminNotification(
      `Critical error in /mcp/viral-content for topic '${topic}' (User: ${req.user.id}). Error: ${error.message}`,
      'critical_error',
      { userId: req.user.id, topic: topic, error: error.stack, requestId: requestId }
    );
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: error.message },
      id: requestId // Use requestId for JSONRPC response
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

// --- Supabase Auth Routes ---

app.post('/api/auth/signup', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase client not initialized. Auth features unavailable.' });
  const { email, password, fullName, avatarUrl, solanaWalletAddress } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      console.error('[AuthSignup] Supabase signUp error:', signUpError.message);
      return res.status(400).json({ error: signUpError.message });
    }

    if (!authData.user) {
        console.error('[AuthSignup] Supabase signUp did not return a user.');
        return res.status(500).json({ error: 'Signup failed: No user data returned.' });
    }

    console.log('[AuthSignup] Supabase user signed up:', authData.user.id, authData.user.email);

    const { data: publicUser, error: publicUserError } = await supabase
      .from('users')
      .insert([{
        id: authData.user.id,
        email: authData.user.email,
        full_name: fullName,
        avatar_url: avatarUrl,
        solana_wallet_address: solanaWalletAddress,
      }])
      .select();

    if (publicUserError) {
      console.error('[AuthSignup] Error creating public user profile:', publicUserError.message);
      // Not sending admin notification for this, as it's logged and user auth itself succeeded.
    } else {
      console.log('[AuthSignup] Public user profile created/updated:', publicUser ? publicUser[0] : null);
    }

    // Send admin notification for new user signup
    await sendAdminNotification(
        `New user signed up: ${authData.user.email} (ID: ${authData.user.id})`,
        'new_user_signup',
        { userId: authData.user.id, email: authData.user.email }
    );

    res.status(201).json({
      message: 'Signup successful. Please check your email for confirmation if enabled.',
      user: authData.user,
      session: authData.session,
      publicProfile: publicUser ? publicUser[0] : null
    });

  } catch (error) {
    console.error('[AuthSignup] Exception:', error.message, error.stack);
    res.status(500).json({ error: 'Internal server error during signup.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase client not initialized.' });
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[AuthLogin] Supabase signIn error:', error.message);
      return res.status(400).json({ error: error.message });
    }
    console.log('[AuthLogin] User logged in:', data.user.id, data.user.email);
    res.status(200).json(data);
  } catch (error) {
    console.error('[AuthLogin] Exception:', error.message, error.stack);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase client not initialized.' });

  // req.user is available here if needed for logging or specific logic
  console.log(`[AuthLogout] User ${req.user.id} attempting to logout.`);

  try {
    const { error } = await supabase.auth.signOut(); // Uses the JWT from the client (via Supabase internal handling if client sets it) or relies on client to discard.
                                                     // For server-initiated signOut with JWT, supabase.auth.admin.signOut(jwt) might be needed, but client-driven is typical.
                                                     // The primary effect of supabase.auth.signOut() when called with a user's JWT is to invalidate that user's refresh tokens on the server.
    if (error) {
      console.error('[AuthLogout] Supabase signOut error:', error.message);
      return res.status(400).json({ error: error.message });
    }
    console.log(`[AuthLogout] User ${req.user.id} logged out. Client should discard JWT.`);
    res.status(200).json({ message: 'Logout successful. Please discard your token.' });
  } catch (error) {
    console.error('[AuthLogout] Exception:', error.message, error.stack);
    res.status(500).json({ error: 'Internal server error during logout.' });
  }
});

app.get('/api/auth/user', authMiddleware, async (req, res) => {
  // req.user is now populated by authMiddleware
  const user = req.user;

  try {
    // Optionally, fetch additional profile data from public.users table
    const { data: publicProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') { // PGRST116: row not found
        console.warn(`[AuthUser] Error fetching public profile for user ${user.id}:`, profileError.message);
    }

    // Combine Supabase auth user with public profile data
    const userResponse = { ...user, publicProfile: publicProfile || null };
    res.status(200).json(userResponse);

  } catch (error) {
    console.error(`[AuthUser] Exception for user ${user.id}:`, error.message, error.stack);
    res.status(500).json({ error: 'Internal server error while fetching user details.' });
  }
});

// --- End Supabase Auth Routes ---

start();