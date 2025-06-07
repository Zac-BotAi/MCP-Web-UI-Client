# Adding New Services to the MCP Viral Content System

## Overview

This document outlines the process for adding new services to the MCP (Media Control Platform) Viral Content System. The system is designed to integrate various AI and web services for automated content creation and distribution.

Services are modular components located in the `services/` directory. Many UI-based services extend the `BaseAIService` (from `base.js`) which provides common functionality for browser automation using Playwright, including session management (loading/saving cookies and local storage) and error screenshots. API-based services might not need `BaseAIService` but should follow a similar structural pattern for consistency.

All services are registered in the `serviceRegistry` object within `server.js`. The key used for registration (e.g., `claude`, `elevenlabs`) serves as the `service_id` for various system functions, including user preferences and API calls like `/api/service/:serviceId/usage`.

## Steps to Add a New Service

Follow these steps to integrate a new service:

### 1. Create Service File
(Content as before)
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
(Content as before, with minor clarification on serviceName matching service_id)
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
    (Content as before)

### 3. Implement Core Logic
(Content as before, with emphasis on error handling using BaseAIService)
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
(Content as before)

### 5. Register in `serviceRegistry` (`server.js`)
(Added note about `service_id` and `functional_type`)
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

For services that display usage information (e.g., remaining credits, tokens, character quotas) on their website, you can implement an optional `async fetchServiceUsage()` method. This allows users to query their current standing with the service via the `/api/service/:serviceId/usage` endpoint.

*   **Method Signature:** `async fetchServiceUsage()`
*   **Assumptions:**
    *   The service instance is already initialized (i.e., `await this.initialize()` has been called).
    *   `this.page` is available and authenticated for the service's website.
*   **Implementation Steps:**
    1.  Log the attempt to fetch usage information.
    2.  Navigate to the specific page on the service's website where usage/quota information is displayed (e.g., account page, subscription page, or dashboard). This might involve clicking through a series of links if a direct URL is not available.
        ```javascript
        // Example navigation (highly site-specific)
        // await this.page.goto('https://exampleservice.com/account/subscription', { waitUntil: 'networkidle' });
        // Or:
        // await this.page.click('#userProfileMenuButton');
        // await this.page.click('#usageLink');
        ```
    3.  Use Playwright selectors to locate and extract the text content of the usage information. This is often the most challenging part due to varying website structures. Try to find stable selectors.
    4.  Return an object containing the extracted data. A simple structure is recommended:
        ```javascript
        return { rawUsageData: "1234 / 10000 characters remaining" };
        // Or more structured if parsing is reliable:
        // return { used: 1234, total: 10000, unit: 'characters', percentage: 12.34 };
        ```
    5.  Implement robust error handling using a `try-catch` block. Call `await this.takeScreenshotOnError('fetchServiceUsage');` in the catch block for debugging.
*   **Example Reference:** See the `fetchServiceUsage()` method in `services/elevenlabs.js` for an example implementation (noting that its selectors are speculative).

### 7. Credentials Management
(Content as before)

### 8. Testing
(Content as before, add note about `PLAYWRIGHT_HEADLESS=false`)
*   **Debugging UI Automation:** If you're working on a UI-based service, you can run the server with the environment variable `PLAYWRIGHT_HEADLESS=false` (e.g., `PLAYWRIGHT_HEADLESS=false node server.js`) to see the browser interactions. This setting is respected by `BaseAIService`.

## API-Based vs. UI-Based Services
(Content as before)

## Service Method Conventions
(Content as before)

---

By following these guidelines, you can effectively integrate new services and expand the capabilities of the MCP Viral Content System. Remember to keep your service modular and well-documented.
