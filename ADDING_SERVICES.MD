# Adding New Services to the MCP Viral Content System

## Overview

This document outlines the process for adding new services to the MCP (Media Control Platform) Viral Content System. The system is designed to integrate various AI and web services for automated content creation and distribution.

Services are modular components located in the `services/` directory. Many UI-based services extend the `BaseAIService` (from `base.js`) which provides common functionality for browser automation using Playwright, including session management (loading/saving cookies and local storage) and error screenshots. API-based services might not need `BaseAIService` but should follow a similar structural pattern for consistency.

All services are registered in the `serviceRegistry` object within `server.js`. The key used for registration (e.g., `claude`, `elevenlabs`) serves as the `service_id` for various system functions, including user preferences and API calls like `/api/service/:serviceId/usage`.

## Steps to Add a New Service

Follow these steps to integrate a new service:

### 1. Create Service File
*   Create a new JavaScript file in the `services/` directory (e.g., `services/my_new_service.js`).
*   Define a class for your service. If it involves UI automation, it should extend `BaseAIService`:
    ```javascript
    // services/my_new_service.js
    const { BaseAIService } = require('../base'); // Adjust path if needed

    class MyNewService extends BaseAIService {
      // ... service methods
    }

    module.exports = MyNewService;
    ```
    For pure API clients, you might not extend `BaseAIService`.

### 2. Constructor
*   **For UI-Based Services (extending `BaseAIService`):**
    Call `super()` with a unique service name and a session name. The `serviceName` argument to `super()` should generally match the `service_id` (the key used in `serviceRegistry`). The `sessionName` is used for storing session state.
    ```javascript
    constructor(name, url) { // name (service_id from registry) & url are passed from serviceRegistry
      // It's crucial that the first argument to super() matches the service_id for consistent logging and session handling
      super(name, `${name}_session`); // e.g., if name is 'claude', session becomes 'claude_session'
      this.url = url;
      console.log(`${this.serviceName} initialized with URL: ${this.url}`);
    }
    ```
*   **For API-Based Services:**
    The constructor should initialize any API clients or configurations. It typically won't call `super()`. Example:
    ```javascript
    constructor(name = 'MyAPIService', config = {}) {
        this.serviceName = name;
        this.apiKey = process.env.MY_API_SERVICE_KEY;
        this.apiEndpoint = config.apiEndpoint || 'https://api.example.com/v1';
        // ... other API client setup ...
        if (!this.apiKey) console.warn(`[${this.serviceName}] API key not found.`);
    }
    ```

### 3. Implement Core Logic
*   Define asynchronous methods specific to the service's functionality (e.g., `generateImage`, `generateAudio`, `postContent`, `generateText`).
*   **Error Handling:** Implement robust error handling. For UI-based services extending `BaseAIService`, use the inherited `this.takeScreenshotOnError('yourMethodNameContext')` within your `catch` blocks before re-throwing the error.
    ```javascript
    async somePlaywrightOperation() {
      if (!this.page) throw new Error('Page not initialized.'); // For UI services
      try {
        // ... Playwright actions or API calls ...
      } catch (error) {
        console.error(`[${this.serviceName}] Error in 'somePlaywrightOperation': ${error.message}`, error.stack);
        // For UI services:
        // await this.takeScreenshotOnError('somePlaywrightOperation');
        throw error;
      }
    }
    ```

### 4. `initialize()` and `close()` Methods
*   **For UI-Based Services (extending `BaseAIService`):**
    *   The base `initialize()` method launches Playwright, sets up `this.browser`, `this.context`, and `this.page`, and attempts to load a saved session. The base `close()` method saves the session and closes the browser.
    *   Use an `isInitialized` flag to make these methods idempotent.
    *   Your service's `initialize` should typically call `await super.initialize();` and then perform any service-specific navigation or checks.
    *   Your service's `close` should call `await super.close();` if `super.initialize()` was called.
    ```javascript
    // Example for UI Service
    async initialize() {
      if (this.isInitialized) return;
      await super.initialize();
      await this.page.goto(this.url, { waitUntil: 'networkidle' });
      // ... any other specific initial setup ...
      this.isInitialized = true;
    }

    async close() {
      if (!this.isInitialized) return;
      await super.close();
      this.isInitialized = false;
    }
    ```
*   **For API-Based Services:**
    *   An `async initialize()` method can be useful for checking API connectivity or fetching initial configuration.
    *   A `async close()` method can be used to release any resources.
    *   These methods will be called by `server.js` if they exist.

### 5. Register in `serviceRegistry` (`server.js`)
*   Add an entry for your new service in the `serviceRegistry` object in `server.js`. The key you use here is the `service_id`.
    ```javascript
    const serviceRegistry = {
      // ... other services
      "myNewService": { // This key is the service_id
        module: './services/my_new_service', // Path to your service file (e.g., my_new_service.js)
        url: 'https://my.service.url/api_or_homepage', // Optional: Default URL for the service
        type: 'ui', // 'ui' for Playwright-based, 'api' for direct API calls
        functional_type: 'image_generation', // E.g., 'image_generation', 'script_generation', etc.
        sessionName: 'my_new_service_session' // Required for UI services, should match super() call
      },
    };
    ```
    *   `service_id` (the key): This identifier is used in `user_service_preferences` and API endpoints like `/api/service/:serviceId/usage`.
    *   `module`: Path to your service file.
    *   `url`: Optional base URL.
    *   `type`: 'ui' or 'api'.
    *   `functional_type`: (Recommended) A string describing the specific function (e.g., 'image_generation', 'voice_generation'). Can be an array if a service has multiple distinct functions (e.g., `['image_generation', 'video_clip_generation']`). This is used by the user preference system.
    *   `sessionName`: Required for UI services that extend `BaseAIService`. Should align with the second argument to `super()` in the service's constructor.

### 6. Implement `fetchServiceUsage()` (Optional)

For services that display usage information (e.g., remaining credits, tokens, character quotas) on their website, you can implement an optional `async fetchServiceUsage()` method. This allows users to query their current standing with the service via the `/api/service/:serviceId/usage` endpoint.

*   **Method Signature:** `async fetchServiceUsage()`
*   **Assumptions:**
    *   The service instance is already initialized (i.e., `await this.initialize()` has been called).
    *   For UI services, `this.page` is available and authenticated for the service's website.
*   **Implementation Steps:**
    1.  Log the attempt to fetch usage information.
    2.  Navigate to the specific page on the service's website where usage/quota information is displayed.
    3.  Use Playwright selectors to locate and extract the text content of the usage information.
    4.  Return an object, e.g., `{ rawUsageData: "1234 / 10000 characters remaining" }`.
    5.  Implement error handling, using `await this.takeScreenshotOnError('fetchServiceUsage');` for UI services.
*   **Example Reference:** See `services/elevenlabs.js` for an example (noting its selectors are speculative). For API services, this would involve calling a specific API endpoint for usage data.

### 7. Credentials Management
*   If your service requires API keys or login credentials, add corresponding entries to `.env.example`.
*   Access these within your service using `process.env.YOUR_VARIABLE_NAME`.
*   **Security Note:** For UI automation, prefer interactive login for the first run (session saved by `BaseAIService`) over storing passwords in `.env`.

### 8. Testing
*   Test your service methods standalone if possible.
*   Test integration within the MCP workflow.
*   For UI automation, use `PLAYWRIGHT_HEADLESS=false` environment variable (e.g., `PLAYWRIGHT_HEADLESS=false node server.js`) to see browser interactions during debugging. This is respected by `BaseAIService`.

## Examples of Integrated Services (Illustrative)

This section provides a quick look at how some services are defined. Refer to their respective files in `services/` and entries in `serviceRegistry` for full details.

*   **Groq (`groq`)**
    *   **Type:** API
    *   **Functional Type:** `strategy_generation`
    *   **Service Class:** `GroqService` in `services/groq.js`
    *   **Description:** Provides content strategy generation via the Groq API.
    *   **Notes:** Requires `GROQ_API_KEY`.

*   **Claude (`claude`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `script_generation`
    *   **Service Class:** `ClaudeService` in `services/claude.js`
    *   **URL:** `https://claude.ai`
    *   **Description:** Generates scripts by automating the Claude.ai web UI.
    *   **Notes:** Selectors are speculative.

*   **Gemini (`gemini`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `script_generation`
    *   **Service Class:** `GeminiService` in `services/gemini.js`
    *   **URL:** `https://gemini.google.com`
    *   **Description:** Generates scripts by automating the Gemini web UI.
    *   **Notes:** Stub implementation.

*   **ElevenLabs (`elevenlabs`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `audio_generation`
    *   **Service Class:** `ElevenLabsService` in `services/elevenlabs.js`
    *   **URL:** `https://elevenlabs.io`
    *   **Description:** Generates audio from script segments by automating ElevenLabs website.
    *   **Notes:** Implements `fetchServiceUsage()`. Selectors are speculative.

*   **Runway (`runway`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `['image_generation', 'video_clip_generation']`
    *   **Service Class:** `RunwayService` in `services/runway.js`
    *   **URL:** `https://runway.ml`
    *   **Description:** Generates images and video clips using RunwayML's web UI.
    *   **Notes:** Handles both image and video clip generation. Aspect ratio control is conceptual. Selectors are speculative.

*   **Canva (`canva`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `video_compilation`
    *   **Service Class:** `CanvaService` in `services/canva.js`
    *   **URL:** `https://canva.com`
    *   **Description:** Compiles video assets using Canva's web UI.
    *   **Notes:** Highly speculative due to Canva's complexity.

*   **YouTube (`youtube`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `social_distribution_youtube`
    *   **Service Class:** `YouTubeService` in `services/youtube.js`
    *   **URL:** `https://youtube.com` (Studio is `https://studio.youtube.com/`)
    *   **Description:** Posts content to YouTube.

*   **TikTok (`tiktok`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `social_distribution_tiktok`
    *   **Service Class:** `TikTokService` in `services/tiktok.js`
    *   **URL:** `https://tiktok.com`
    *   **Description:** Posts content to TikTok. Handles iframe.

*   **Instagram (`instagram`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `social_distribution_instagram`
    *   **Service Class:** `InstagramService` in `services/instagram.js`
    *   **URL:** `https://instagram.com`
    *   **Description:** Posts content to Instagram.

*   **RaphaelAI (`raphaelai`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `image_generation`
    *   **Service Class:** `RaphaelAIService` in `services/raphaelai_service.js`
    *   **URL:** `https://raphaelai.org/`
    *   **Description:** AI image generation from text prompts.
    *   **Notes:** Speculative selectors. `fetchServiceUsage` is a stub.

*   **RedPanda AI (`redpandaai`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `image_generation`
    *   **Service Class:** `RedPandaAIService` in `services/redpandaai_service.js`
    *   **URL:** `https://redpandaai.com/tools/ai-image-generator`
    *   **Description:** AI image generation.
    *   **Notes:** Speculative selectors. `fetchServiceUsage` is a stub.

*   **Speechify (`speechify`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `audio_generation`
    *   **Service Class:** `SpeechifyService` in `services/speechify_service.js`
    *   **URL:** `https://speechify.com/ai-voice-generator/`
    *   **Description:** AI text-to-voice generation.
    *   **Notes:** Speculative selectors. `fetchServiceUsage` is a stub.

*   **Veed.io (`veedio`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `video_generation`
    *   **Service Class:** `VeedIOService` in `services/veedio_service.js`
    *   **URL:** `https://www.veed.io/tools/ai-video`
    *   **Description:** AI video generation and editing.
    *   **Notes:** Highly speculative selectors. `fetchServiceUsage` is a stub.

*   **Vheer.com (`vheer`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `image_generation`
    *   **Service Class:** `VheerService` in `services/vheer_service.js`
    *   **URL:** `https://vheer.com/`
    *   **Description:** AI image generation.
    *   **Notes:** Speculative selectors. `fetchServiceUsage` is a stub.

*   **Perchance Image Gen (`perchance_image_gen`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `image_generation`
    *   **Service Class:** `PerchanceImageGenService` in `services/perchance_image_gen_service.js`
    *   **URL:** `https://perchance.org/ai-text-to-image-generator`
    *   **Description:** Image generation using Perchance.org.
    *   **Notes:** Speculative selectors. `fetchServiceUsage` indicates 'Free'.

*   **Piclumen (`piclumen`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `image_generation`
    *   **Service Class:** `PiclumenService` in `services/piclumen_service.js`
    *   **URL:** `https://www.piclumen.com/`
    *   **Description:** AI image generation.
    *   **Notes:** Speculative selectors. `fetchServiceUsage` is a stub.

*   **AIVoiceGenerator.com (`aivoicegenerator_com`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `audio_generation`
    *   **Service Class:** `AIVoiceGeneratorComService` in `services/aivoicegenerator_com_service.js`
    *   **URL:** `https://aivoicegenerator.com/`
    *   **Notes:** Speculative selectors. `fetchServiceUsage` is a stub.

*   **Giz.ai Voice (`giz_voice`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `audio_generation`
    *   **Service Class:** `GizVoiceService` in `services/giz_voice_service.js`
    *   **URL:** `https://giz.ai/ai-voice-generator/`
    *   **Notes:** Speculative selectors. `fetchServiceUsage` is a stub. Uses `giz_session`.

*   **TheAIVoiceGenerator.com (`theaivoicegenerator`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `audio_generation`
    *   **Service Class:** `TheAIVoiceGeneratorService` in `services/theaivoicegenerator_service.js`
    *   **URL:** `https://theaivoicegenerator.com/`
    *   **Notes:** Speculative selectors. `fetchServiceUsage` is a stub.

*   **Crikk TTS (`crikk_tts`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `audio_generation`
    *   **Service Class:** `CrikkTTSService` in `services/crikk_tts_service.js`
    *   **URL:** `https://crikk.com/text-to-speech/`
    *   **Notes:** Speculative selectors. `fetchServiceUsage` indicates 'Free'.

*   **Giz.ai Video (`giz_video`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `video_generation`
    *   **Service Class:** `GizVideoService` in `services/giz_video_service.js`
    *   **URL:** `https://giz.ai/ai-video-generator/`
    *   **Notes:** Highly speculative selectors. `fetchServiceUsage` is a stub. Uses `giz_session`.

*   **VideoGalaxy.ai (`videogalaxy`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `video_generation`
    *   **Service Class:** `VideoGalaxyService` in `services/videogalaxy_service.js`
    *   **URL:** `https://video.galaxy.ai/ai-video-generator`
    *   **Notes:** Highly speculative selectors. `fetchServiceUsage` is a stub.

*   **Kapwing (`kapwing`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `video_generation` (or `video_editing`)
    *   **Service Class:** `KapwingService` in `services/kapwing_service.js`
    *   **URL:** `https://www.kapwing.com/ai-video-generator`
    *   **Notes:** Highly speculative selectors. `fetchServiceUsage` is a stub.

*   **Vondy.com Video (`vondy_video`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `video_generation`
    *   **Service Class:** `VondyVideoService` in `services/vondy_video_service.js`
    *   **URL:** `https://www.vondy.com/free-ai-video-generator-no-sign-up--KG6eAUFm`
    *   **Notes:** Assumes "no sign-up". Speculative selectors. `fetchServiceUsage` indicates 'Free'.

*   **VideoPlus.ai (`videoplus`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `video_generation`
    *   **Service Class:** `VideoPlusService` in `services/videoplus_service.js`
    *   **URL:** `https://videoplus.ai/`
    *   **Notes:** Speculative selectors. `fetchServiceUsage` is a stub.

*   **DeepAI Video (`deepai_video`)**
    *   **Type:** UI Automation (if UI path is implemented)
    *   **Functional Type:** `video_generation`
    *   **Service Class:** `DeepAIVideoService` in `services/deepai_video_service.js`
    *   **URL:** `https://deepai.org/video`
    *   **Notes:** Speculative UI selectors. Handles direct URL/blob downloads. `fetchServiceUsage` is a stub.

*   **Blotato (`blotato`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `social_media_management` (e.g., `text_repurposing`)
    *   **Service Class:** `BlotatoService` in `services/blotato_service.js`
    *   **URL:** `https://www.blotato.com/`
    *   **Notes:** Highly speculative. `fetchServiceUsage` is a stub.

*   **DeepSeek (`deepseek`)**
    *   **Type:** API (default)
    *   **Functional Type:** `text_generation`
    *   **Service Class:** `DeepSeekService` in `services/deepseek_service.js`
    *   **Notes:** Primarily API-based. UI automation path is conceptual. Requires `DEEPSEEK_API_KEY`.

## API-Based vs. UI-Based Services
*   **UI-Based Services:**
    *   Extend `BaseAIService`.
    *   Use `this.page` (Playwright Page object) for interactions.
    *   Rely on `BaseAIService` for browser launch, session loading/saving, and closing.
*   **API-Based Services:**
    *   Typically do not extend `BaseAIService`.
    *   Use an HTTP client (like `axios`) or a specific SDK to interact with the service's API.
    *   Manage their own client setup and API key handling.

## Service Method Conventions

While not strictly enforced, try to follow consistent naming for common actions where it makes sense:

*   `generate...`: For content generation (e.g., `generateScript`, `generateImage`, `generateAudio`, `generateVideo`).
*   `post...`: For publishing content (e.g., `postContent`).
*   `fetch...`: For retrieving data (e.g., `fetchServiceUsage`).
*   `compile...`: For combining assets (e.g., `compileVideo`).
*   `repurpose...`: For transforming content (e.g., `repurposeText`).

This helps in understanding the role of different methods when looking at `server.js` or other services.

---

By following these guidelines, you can effectively integrate new services and expand the capabilities of the MCP Viral Content System. Remember to keep your service modular and well-documented.
