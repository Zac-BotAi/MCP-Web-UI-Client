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
  groq: { module: './services/groq', type: 'api', functional_type: 'strategy_generation' },
  claude: { module: './services/claude', url: 'https://claude.ai', type: 'ui', functional_type: 'script_generation', sessionName: 'claude_session' },
  gemini: { module: './services/gemini', url: 'https://gemini.google.com', type: 'ui', functional_type: 'script_generation', sessionName: 'gemini_session' },
  elevenlabs: { module: './services/elevenlabs', url: 'https://elevenlabs.io', type: 'ui', functional_type: 'audio_generation', sessionName: 'elevenlabs_session' },
  runway: {
    module: './services/runway',
    url: 'https://runway.ml',
    type: 'ui',
    functional_type: ['image_generation', 'video_clip_generation'], // Array for multiple types
    sessionName: 'runway_session'
  },
  raphaelai: {
    module: './services/raphaelai_service',
    url: 'https://raphaelai.org/',
    type: 'ui',
    functional_type: 'image_generation',
    sessionName: 'raphaelai_session'
  },
  redpandaai: {
    module: './services/redpandaai_service',
    url: 'https://redpandaai.com/tools/ai-image-generator',
    type: 'ui',
    functional_type: 'image_generation',
    sessionName: 'redpandaai_session'
  },
  speechify: {
    module: './services/speechify_service',
    url: 'https://speechify.com/ai-voice-generator/',
    type: 'ui',
    functional_type: 'audio_generation',
    sessionName: 'speechify_session'
  },
  veedio: {
    module: './services/veedio_service',
    url: 'https://www.veed.io/tools/ai-video',
    type: 'ui',
    functional_type: 'video_generation',
    sessionName: 'veedio_session'
  },
  canva: { module: './services/canva', url: 'https://canva.com', type: 'ui', functional_type: 'video_compilation', sessionName: 'canva_session' },
  youtube: { module: './services/youtube', url: 'https://youtube.com', type: 'ui', functional_type: 'social_distribution_youtube', sessionName: 'youtube_session' },
  tiktok: { module: './services/tiktok', url: 'https://tiktok.com', type: 'ui', functional_type: 'social_distribution_tiktok', sessionName: 'tiktok_session' },
  instagram: { module: './services/instagram', url: 'https://instagram.com', type: 'ui', functional_type: 'social_distribution_instagram', sessionName: 'instagram_session' }
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
  
  async getPreferredService(userId, serviceType, defaultServiceId) {
    let serviceToUseId = defaultServiceId;
    const logContext = userId ? `[${userId}]` : `[SystemDefault]`;
    console.log(\`\${logContext} [ServiceSelection] Getting preferred service for type: \${serviceType}, default: \${defaultServiceId}\`);

    if (supabase && userId) {
      try {
        const { data: preferences, error: prefError } = await supabase
          .from('user_service_preferences')
          .select('service_id, priority')
          .eq('user_id', userId)
          .eq('service_type', serviceType)
          .order('priority', { ascending: true });

        if (prefError) {
          console.warn(\`\${logContext} [ServiceSelection] Error fetching preferences for \${serviceType}: \${prefError.message}. Using default.\`);
        } else if (preferences && preferences.length > 0) {
          for (const pref of preferences) {
            if (serviceRegistry[pref.service_id]) {
              serviceToUseId = pref.service_id;
              console.log(\`\${logContext} [ServiceSelection] User preference found: Using '\${serviceToUseId}' for \${serviceType} (Priority: \${pref.priority}).\`);
              break;
            } else {
              console.log(\`\${logContext} [ServiceSelection] User preferred service '\${pref.service_id}' not found/usable in registry for \${serviceType}. Trying next.\`);
            }
          }
          if (serviceToUseId === defaultServiceId && preferences.length > 0) { // Only log if preferences existed but none were matched
               console.log(\`\${logContext} [ServiceSelection] None of user's preferred services for \${serviceType} were available/found in registry. Using default '\${defaultServiceId}'.\`);
          }
        } else {
          console.log(\`\${logContext} [ServiceSelection] No user preferences set for \${serviceType}. Using default '\${defaultServiceId}'.\`);
        }
      } catch (error) {
        console.error(\`\${logContext} [ServiceSelection] Exception fetching preferences for \${serviceType}: \${error.message}. Using default.\`);
      }
    } else {
       console.log(\`[ServiceSelection] No user or Supabase client for preference check. Using default '\${defaultServiceId}' for \${serviceType}.\`);
    }

    if (!serviceRegistry[serviceToUseId]) {
        console.error(\`[ServiceSelection] CRITICAL: Service ID '\${serviceToUseId}' (selected for \${serviceType}) not in serviceRegistry! This indicates a misconfiguration or issue with default values.\`);
        // Fallback to a known default or throw error. For now, let it proceed and fail at loadService.
    }
    return serviceToUseId;
  }

  async createViralContent(topic, userId = null, clientParams = {}) { // Added clientParams for aspect ratio etc.
    const contentId = uuidv4();
    const userLogPrefix = userId ? `[User:\${userId.substring(0,8)}]` : `[System]`;
    const aspectRatio = clientParams.aspectRatio; // Extract aspect ratio
    console.log(\`\${userLogPrefix} --- Starting createViralContent for topic: ${topic}, AspectRatio: \${aspectRatio || 'default'} --- ${contentId}\`);
    
    // Step 1: Content strategy
    const strategyServiceId = await this.getPreferredService(userId, 'strategy_generation', 'groq');
    const strategyService = await loadService(strategyServiceId);
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Step 1: Generating content strategy with \${strategyServiceId}...\`);
    const strategy = await strategyService.generateStrategy(topic);
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Strategy generated successfully with \${strategyServiceId}.\`);
    
    // Step 2: Media creation
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Step 2: Generating media assets...\`);

    const scriptServiceId = await this.getPreferredService(userId, 'script_generation', 'claude');
    const scriptService = await loadService(scriptServiceId);
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Step 2a: Generating script with \${scriptServiceId}...\`);
    const script = await scriptService.generateScript(strategy);
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Script generated with \${scriptServiceId}: ${script.substring(0, 50)}...\`);

    const imageServiceId = await this.getPreferredService(userId, 'image_generation', 'runway'); // Default can be runway
    const imageService = await loadService(imageServiceId);
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Step 2b: Generating image with \${imageServiceId} (Aspect: \${aspectRatio || 'default'})...\`);
    const image = await imageService.generateImage(strategy.visualPrompt, aspectRatio); // Pass aspectRatio
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Image generated with \${imageServiceId}: ${image.path}`);

    const audioServiceId = await this.getPreferredService(userId, 'audio_generation', 'elevenlabs');
    const audioService = await loadService(audioServiceId);
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Step 2c: Generating audio with \${audioServiceId}...\`);
    const audio = await audioService.generateAudio(strategy.scriptSegment);
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Audio generated with \${audioServiceId}: ${audio.path}`);

    // Assuming Runway is also used for video clip generation by default
    const videoClipServiceId = await this.getPreferredService(userId, 'video_clip_generation', 'runway');
    const videoClipService = await loadService(videoClipServiceId);
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Step 2d: Generating video clip with \${videoClipServiceId}...\`);
    const video = await videoClipService.generateVideo(strategy); // Assuming generateVideo is the method for clips
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Video clip generated with \${videoClipServiceId}: ${video.path}`);

    const assets = { script, image, audio, video };
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] All media assets generated.\`);
    
    // Step 3: Compile final content
    const compilationServiceId = await this.getPreferredService(userId, 'video_compilation', 'canva');
    const compilationService = await loadService(compilationServiceId);
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Step 3: Compiling final content with \${compilationServiceId}...\`);
    const finalVideo = await compilationService.compileVideo({
      ...assets,
      music: strategy.viralMusicPrompt
    });
    console.log(\`\${userLogPrefix} [\${contentId}] [ViralWorkflow] Final video compiled with \${compilationServiceId}: ${finalVideo.path}`);
    
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
    const { topic, aspectRatio } = params; // Extract aspectRatio here
    const result = await viralSystem.createViralContent(topic, req.user.id, { aspectRatio }); // Pass clientParams object
    
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

// --- User Preferences Routes ---

app.post('/api/user/preferences', authMiddleware, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase client not initialized.' });
  const userId = req.user.id;
  const { preferences } = req.body; // Expects an array of preference objects

  if (!Array.isArray(preferences) || preferences.some(p => !p.service_type || !p.service_id || p.priority === undefined)) {
    return res.status(400).json({ error: 'Invalid preferences format. Must be an array of {service_type, service_id, priority}.' });
  }

  console.log(\`[UserPrefs][\${userId}] Updating service preferences.\`, preferences);

  try {
    const preferencesByType = preferences.reduce((acc, p) => {
      acc[p.service_type] = acc[p.service_type] || [];
      acc[p.service_type].push({
        user_id: userId,
        service_type: p.service_type,
        service_id: p.service_id,
        priority: p.priority
      });
      return acc;
    }, {});

    for (const serviceType in preferencesByType) {
      const prefsForType = preferencesByType[serviceType];

      // Delete existing preferences for this user and service_type
      const { error: deleteError } = await supabase
        .from('user_service_preferences')
        .delete()
        .match({ user_id: userId, service_type: serviceType });

      if (deleteError) {
        console.error(\`[UserPrefs][\${userId}] Error deleting old preferences for \${serviceType}:\`, deleteError);
        await sendAdminNotification(\`Error deleting old prefs for user \${userId}, type \${serviceType}.\`, 'user_preference_error', { userId, serviceType, error: deleteError.message });
        // Decide if this is fatal for the whole request or just this type. For now, continue.
      }

      // Insert new preferences for this service_type
      if (prefsForType.length > 0) {
        const { error: insertError } = await supabase
          .from('user_service_preferences')
          .insert(prefsForType);

        if (insertError) {
          console.error(\`[UserPrefs][\${userId}] Error inserting new preferences for \${serviceType}:\`, insertError);
          await sendAdminNotification(\`Error inserting new prefs for user \${userId}, type \${serviceType}.\`, 'user_preference_error', { userId, serviceType, error: insertError.message });
          return res.status(500).json({ error: \`Failed to update preferences for \${serviceType}.\`});
        }
      }
    }

    console.log(\`[UserPrefs][\${userId}] Service preferences updated successfully.\`);
    res.status(200).json({ message: 'Preferences updated successfully.' });

  } catch (error) {
    console.error(\`[UserPrefs][\${userId}] Exception updating preferences:\`, error);
    await sendAdminNotification(\`Exception updating preferences for user \${userId}.\`, 'user_preference_error', { userId, error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error while updating preferences.' });
  }
});

app.get('/api/user/preferences', authMiddleware, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase client not initialized.' });
  const userId = req.user.id;

  try {
    const { data, error } = await supabase
      .from('user_service_preferences')
      .select('*')
      .eq('user_id', userId)
      .order('service_type', { ascending: true })
      .order('priority', { ascending: true });

    if (error) {
      console.error(\`[UserPrefs][\${userId}] Error fetching preferences:\`, error);
      return res.status(500).json({ error: 'Failed to fetch preferences.' });
    }

    res.status(200).json(data || []);

  } catch (error) {
    console.error(\`[UserPrefs][\${userId}] Exception fetching preferences:\`, error);
    res.status(500).json({ error: 'Internal server error while fetching preferences.' });
  }
});

// --- End User Preferences Routes ---

/*
CONCEPTUAL PAYMENT SYSTEM DESIGN (Solana Pay & Supabase)

User Flow:
1. User selects a subscription plan (e.g., Monthly $49, Annual $490) in a client application (not built here).
2. Client calls `/api/payments/initiate_subscription` with plan choice and user ID (from auth).
3. Backend generates a unique reference ID for the transaction, stores it (e.g., in `payments` table with 'pending' status).
4. Backend responds with Solana Pay parameters:
    - Recipient address (merchant's Solana wallet).
    - Amount (converted to SOL at current rate, or a fixed SOL price).
    - SPL Token (if paying with USDC on Solana, etc.).
    - Reference ID (for matching the transaction).
    - Label/Memo.
5. Client uses these parameters to construct a Solana Pay transaction (e.g., display QR code, deeplink to wallet).
6. User approves the transaction in their Solana wallet.

Payment Confirmation (Webhook/Listener Approach - Most Robust):
1. A separate listener service (or a Solana Pay compatible processor) monitors the Solana blockchain for transactions to the merchant's address that include the unique reference ID.
2. Upon detecting a confirmed transaction matching a reference ID:
    a. The listener service (or processor) calls a secure webhook on our backend: `/api/payments/webhook/solana_confirmation`.
    b. Webhook payload includes the reference ID, transaction signature, amount paid, etc.
3. Backend webhook handler:
    a. Verifies the authenticity of the webhook call (e.g., using a secret key).
    b. Validates the transaction details against the 'pending' payment record (amount, currency).
    c. Updates the `payments` table status to 'completed'.
    d. Updates the `users` table:
        - `subscription_status` to 'active_monthly' or 'active_annual'.
        - `subscription_expires_at` (now + 1 month or + 1 year).
    e. Sends admin notification for new successful subscription.

Alternative (Client-Side Polling - Less Robust, Not Recommended for Production):
- Client polls a backend endpoint after user claims payment was made. Backend checks blockchain via RPC. Highly complex and less reliable.

Subscription Management:
- A scheduled task (e.g., daily cron job, not part of this app) could check for expired subscriptions and update `subscription_status`.
- Or, `authMiddleware` or a dedicated subscription check middleware could verify `subscription_expires_at` on each API call to protected content.

Pricing:
- Monthly: $49 (USD value in SOL)
- Annual: $490 (USD value in SOL - offering a discount, e.g., ~16% off or $40.83/month equiv.)
            The user story said 49x12 = $588. This needs clarification. Assuming $490 for annual to reflect a discount.
            If it's strictly 49x12, then $588. For now, design will assume a distinct annual price.
*/

// --- Payment Routes ---

app.post('/api/payments/initiate_subscription', authMiddleware, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase client not initialized.' });

  const { planId, solanaPriceUSD } = req.body; // planId: 'monthly', 'annual'. solanaPriceUSD needed if converting dynamically
  const userId = req.user.id;

  console.log(`[PaymentInitiate][\${userId}] Initiating subscription for plan: \${planId}`);

  // --- Price Configuration (Example - should be in a config or DB) ---
  const plans = {
    monthly: { amountUSD: 49, durationMonths: 1, name: 'Monthly Unlimited' },
    annual: { amountUSD: 490, durationMonths: 12, name: 'Annual Unlimited' } // Assuming discount, else 588
  };
  const selectedPlan = plans[planId];
  if (!selectedPlan) {
    await sendAdminNotification(\`Invalid plan ID '\${planId}' attempt by user \${userId}.\`, 'payment_error', { userId, planId });
    return res.status(400).json({ error: 'Invalid plan ID.' });
  }

  const amountSOL = selectedPlan.amountUSD / (solanaPriceUSD || 200); // Example: SOL @ $200 USD

  const paymentReference = \`MCP-\${userId.substring(0,8)}-\${Date.now()}\`;

  try {
    const { data: paymentRecord, error: paymentError } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        external_transaction_id: paymentReference,
        amount: selectedPlan.amountUSD,
        currency: 'USD',
        payment_method: 'solana',
        status: 'pending_initiation',
        subscription_months: selectedPlan.durationMonths,
        metadata: { planId: planId, solana_price_usd_at_init: solanaPriceUSD, expected_sol_amount: amountSOL }
      })
      .select()
      .single();

    if (paymentError) {
      console.error(\`[PaymentInitiate][\${userId}] Error creating pending payment record:\`, paymentError);
      await sendAdminNotification(\`Failed to create pending payment for user \${userId}, plan \${planId}.\`, 'payment_error', { userId, planId, error: paymentError.message });
      return res.status(500).json({ error: 'Failed to initiate payment record.' });
    }

    console.log(\`[PaymentInitiate][\${userId}] Pending payment \${paymentRecord.id} created for \${planId}. Ref: \${paymentReference}\`);

    res.status(200).json({
      message: 'Payment initiation successful. Proceed with Solana Pay.',
      paymentReference: paymentReference,
      recipient: process.env.MERCHANT_SOLANA_WALLET,
      amount: amountSOL.toFixed(9),
      splToken: null,
      label: selectedPlan.name,
      memo: paymentReference
    });

  } catch (error) {
    console.error(\`[PaymentInitiate][\${userId}] Exception in /initiate_subscription:\`, error);
    await sendAdminNotification(\`Exception during payment initiation for user \${userId}, plan \${planId}.\`, 'payment_error', { userId, planId, error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error during payment initiation.' });
  }
});

app.post('/api/payments/webhook/solana_confirmation', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase client not initialized.' });

  const { reference, transactionSignature, status: solanaStatus, amountPaid /*, ...other data from processor */ } = req.body;
  const webhookSecret = req.headers['x-webhook-secret'];

  if (webhookSecret !== process.env.SOLANA_WEBHOOK_SECRET) {
    console.warn('[Webhook] Unauthorized webhook attempt. IP:', req.ip);
    await sendAdminNotification('Unauthorized Solana webhook attempt.', 'security_alert', { ip: req.ip, body: req.body });
    return res.status(403).json({ error: 'Forbidden. Invalid secret.' });
  }

  console.log(\`[Webhook] Received Solana confirmation for reference: \${reference}, TxSig: \${transactionSignature}, Status: \${solanaStatus}\`);

  try {
    const { data: payment, error: findError } = await supabase
      .from('payments')
      .select('*')
      .eq('external_transaction_id', reference)
      .eq('status', 'pending_initiation')
      .single();

    if (findError || !payment) {
      console.error(\`[Webhook] Payment record not found or already processed for reference: \${reference}\`, findError);
      await sendAdminNotification(\`Webhook: Payment record not found/processed for ref \${reference}.\`, 'payment_webhook_error', { reference, body: req.body, findError: findError ? findError.message : 'Not found' });
      return res.status(404).json({ error: 'Payment record not found or already processed.' });
    }

    if (solanaStatus !== 'confirmed' && solanaStatus !== 'finalized') {
        console.log(\`[Webhook] Payment \${payment.id} for ref \${reference} not yet confirmed by processor. Status: \${solanaStatus}\`);
        // Optionally update status to 'pending_processor_confirmation' if desired
        // await supabase.from('payments').update({ status: 'pending_processor_confirmation', metadata: { ...payment.metadata, processor_status: solanaStatus } }).eq('id', payment.id);
        return res.status(200).json({ message: 'Webhook received, payment awaiting final confirmation from processor.'});
    }

    const { data: updatedPayment, error: updatePaymentError } = await supabase
      .from('payments')
      .update({
        status: 'completed',
        external_transaction_id: transactionSignature,
        updated_at: new Date().toISOString(),
        metadata: { ...payment.metadata, solana_tx_sig: transactionSignature, processor_status: solanaStatus, webhook_payload: req.body, amount_paid_processor: amountPaid }
      })
      .eq('id', payment.id)
      .select()
      .single();

    if (updatePaymentError) {
      console.error(\`[Webhook] Error updating payment record \${payment.id} for ref \${reference}:\`, updatePaymentError);
      await sendAdminNotification(\`Webhook: Failed to update payment \${payment.id} (ref \${reference}) after confirmation.\`, 'payment_webhook_error', { reference, paymentId: payment.id, error: updatePaymentError.message });
      return res.status(500).json({ error: 'Failed to update payment record.' });
    }

    const currentExpiry = new Date();
    const newExpiryDate = new Date(currentExpiry.setMonth(currentExpiry.getMonth() + updatedPayment.subscription_months));

    const { data: updatedUser, error: updateUserError } = await supabase
      .from('users')
      .update({
        subscription_status: \`active_\${updatedPayment.metadata.planId || 'general'}\`,
        subscription_expires_at: newExpiryDate.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', payment.user_id)
      .select()
      .single();

    if (updateUserError) {
      console.error(\`[Webhook] Error updating user \${payment.user_id} subscription for payment \${payment.id}:\`, updateUserError);
      await sendAdminNotification(\`Webhook: Failed to update user \${payment.user_id} subscription for payment \${payment.id}.\`, 'payment_webhook_error', { reference, paymentId: payment.id, userId: payment.user_id, error: updateUserError.message });
      return res.status(500).json({ error: 'Payment processed, but failed to update user subscription.' });
    }

    console.log(\`[Webhook] User \${payment.user_id} subscription updated successfully. Plan: \${updatedPayment.metadata.planId}, Expires: \${newExpiryDate.toISOString()}\`);
    await sendAdminNotification(\`New successful subscription: User \${payment.user_id}, Plan: \${updatedPayment.metadata.planId}, Tx: \${transactionSignature ? transactionSignature.substring(0,10) : 'N/A'}...\`, 'new_subscription', { userId: payment.user_id, plan: updatedPayment.metadata.planId, paymentId: payment.id });

    res.status(200).json({ message: 'Webhook processed successfully. Subscription updated.' });

  } catch (error) {
    console.error('[Webhook] Exception:', error);
    await sendAdminNotification(\`Exception in Solana Webhook for ref \${reference}.\`, 'payment_webhook_error', { reference, error: error.message, stack: error.stack, body: req.body });
    res.status(500).json({ error: 'Internal server error processing webhook.' });
  }
});

// --- End Payment Routes ---

// --- Service Usage Endpoint ---
app.get('/api/service/:serviceId/usage', authMiddleware, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase client not initialized.' });

  const { serviceId } = req.params;
  const userId = req.user.id;

  console.log(`[ServiceUsage][\${userId}] User requesting usage for service: \${serviceId}`);

  const serviceConfig = serviceRegistry[serviceId];
  if (!serviceConfig || !serviceConfig.module) {
    return res.status(404).json({ error: \`Service '\${serviceId}' not found, not supported, or misconfigured.\` });
  }

  let serviceInstance;
  try {
    const ServiceClass = require(serviceConfig.module);

    // Instantiate service: Services are expected to set their own serviceName & sessionName in constructor
    // e.g. super('ElevenLabsService', 'elevenlabs_session');
    // The URL from serviceConfig.url is passed for services that need it.
    serviceInstance = new ServiceClass(serviceId, serviceConfig.url);

    // Ensure the instance has a BaseAIService-compatible sessionName for initialization if it's UI based
    // This is implicitly handled if the service class constructor calls super() correctly.
    // We also need to ensure the user's session is correctly loaded.
    // BaseAIService's initialize() loads session based on this.sessionName.
    // For user-specific data, the sessionName should ideally be user-scoped or BaseAIService context needs user scoping.
    // This is a simplification for now: it uses the generic session for that service type.
    // True user-specific usage fetching might require user-scoped session names in BaseAIService.
    // Or, the service's fetchServiceUsage itself handles multi-user scenarios if the site shows usage for the logged-in user.

    await serviceInstance.initialize();

    if (typeof serviceInstance.fetchServiceUsage !== 'function') {
      await serviceInstance.close();
      return res.status(501).json({ error: \`Service '\${serviceId}' does not support fetching usage information.\` });
    }

    const usageData = await serviceInstance.fetchServiceUsage();
    await serviceInstance.close();

    res.status(200).json({ serviceId, usageData });

  } catch (error) {
    console.error(\`[ServiceUsage][\${userId}] Error fetching usage for \${serviceId}:\`, error.message, error.stack);
    if (serviceInstance && typeof serviceInstance.takeScreenshotOnError === 'function') {
      // The errorContextName here could be more specific if error occurred within serviceInstance methods
      await serviceInstance.takeScreenshotOnError('getServiceUsageApiHandler');
    }
    if (serviceInstance && typeof serviceInstance.close === 'function') {
      await serviceInstance.close();
    }
    await sendAdminNotification(\`Error fetching usage for service '\${serviceId}', user \${userId}.\`, 'service_usage_error', { userId, serviceId, error: error.message, stack: error.stack });
    res.status(500).json({ error: \`Failed to fetch usage for \${serviceId}: \${error.message}\` });
  }
});

// --- End Service Usage Endpoint ---

start();