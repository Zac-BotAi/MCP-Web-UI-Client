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
    The constructor should initialize any API clients or configurations. It typically won't call `super()`.

### 3. Implement Core Logic
*   Define asynchronous methods specific to the service's functionality.
*   **Error Handling:** Implement robust error handling. For UI-based services extending `BaseAIService`, use the inherited `this.takeScreenshotOnError('yourMethodNameContext')` within your `catch` blocks before re-throwing the error.
    ```javascript
    async somePlaywrightOperation() {
      if (!this.page) throw new Error('Page not initialized.');
      try {
        // ... Playwright actions ...
      } catch (error) {
        console.error(`[${this.serviceName}] Error in 'somePlaywrightOperation': ${error.message}`, error.stack);
        await this.takeScreenshotOnError('somePlaywrightOperation');
        throw error;
      }
    }
    ```

### 4. `initialize()` and `close()` Methods
(Content as before - details omitted for brevity in this diff view but are present in the actual file)

### 5. Register in `serviceRegistry` (`server.js`)
*   Add an entry for your new service in the `serviceRegistry` object in `server.js`. The key you use here is the `service_id`.
    ```javascript
    const serviceRegistry = {
      // ... other services
      "myNewService": { // This key is the service_id
        module: './services/my_new_service',
        url: 'https://my.service.url/api_or_homepage',
        type: 'ui', // 'ui' or 'api'
        functional_type: 'image_generation', // E.g., 'image_generation', 'script_generation', etc. (optional but useful)
        sessionName: 'my_new_service_session' // Optional: if BaseAIService constructor needs it explicitly, though it can derive it
      },
    };
    ```
    *   `service_id` (the key): This identifier is used in `user_service_preferences` and API endpoints like `/api/service/:serviceId/usage`.
    *   `module`: Path to your service file.
    *   `url`: Optional base URL.
    *   `type`: 'ui' or 'api'.
    *   `functional_type`: (Recommended) A string describing the specific function (e.g., 'image_generation', 'voice_generation'). This is used by the user preference system.
    *   `sessionName`: (Optional) If your service's constructor needs a specific session name passed to `super()`, otherwise it can be derived (e.g., `service_id + '_session'`).

### 6. Implement `fetchServiceUsage()` (Optional)
(Content as before - details omitted for brevity)

### 7. Credentials Management
(Content as before - details omitted for brevity)

### 8. Testing
(Content as before, add note about `PLAYWRIGHT_HEADLESS=false` - details omitted for brevity)

## Examples of Integrated Services (Illustrative)

This section provides a quick look at how some services are defined. Refer to their respective files in `services/` and entries in `serviceRegistry` for full details.

*   **Groq (`groq`)**
    *   **Type:** API
    *   **Functional Type:** `strategy_generation`
    *   **Service Class:** `GroqService` in `services/groq.js`
    *   **Description:** Provides content strategy generation via the Groq API.
    *   **Notes:** Requires `GROQ_API_KEY` in environment variables.

*   **ElevenLabs (`elevenlabs`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `audio_generation`
    *   **Service Class:** `ElevenLabsService` in `services/elevenlabs.js`
    *   **Description:** Generates audio from script segments by automating ElevenLabs website.
    *   **Notes:** Implements `fetchServiceUsage()` to scrape character quota information. Selectors are speculative.

*   **RaphaelAI (`raphaelai`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `image_generation`
    *   **Service Class:** `RaphaelAIService` in `services/raphaelai_service.js`
    *   **Description:** AI image generation from text prompts via `raphaelai.org`.
    *   **Notes:** Implementation uses speculative selectors. `fetchServiceUsage` is a stub and needs UI-specific selectors. Aspect ratio control logic is a placeholder.

*   **RedPanda AI (`redpandaai`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `image_generation`
    *   **Service Class:** `RedPandaAIService` in `services/redpandaai_service.js`
    *   **URL:** `https://redpandaai.com/tools/ai-image-generator` (default, can be overridden in `serviceRegistry`)
    *   **Description:** AI image generation from text prompts.
    *   **Notes:** Implementation uses speculative selectors. `fetchServiceUsage` is a stub. Aspect ratio control logic is a placeholder. Requires real-world testing and selector validation.

*   **Speechify (`speechify`)**
    *   **Type:** UI Automation
    *   **Functional Type:** `audio_generation`
    *   **Service Class:** `SpeechifyService` in `services/speechify_service.js`
    *   **URL:** `https://speechify.com/ai-voice-generator/` (default, can be overridden in `serviceRegistry`)
    *   **Description:** AI text-to-voice generation.
    *   **Notes:** Implementation uses speculative selectors for UI elements on Speechify's website. `fetchServiceUsage` is a stub. Voice selection logic is conceptual (uses defaults). Requires real-world testing and selector validation.

## API-Based vs. UI-Based Services
(Content as before - details omitted for brevity)

## Service Method Conventions
(Content as before - details omitted for brevity)

---

By following these guidelines, you can effectively integrate new services and expand the capabilities of the MCP Viral Content System. Remember to keep your service modular and well-documented.
