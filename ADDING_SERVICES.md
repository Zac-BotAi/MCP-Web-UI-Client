# Adding New Services to the MCP Viral Content System

## Overview

This document outlines the process for adding new services to the MCP (Media Control Platform) Viral Content System. The system is designed to integrate various AI and web services for automated content creation and distribution.

Services are modular components located in the `services/` directory. Many UI-based services extend the `BaseAIService` (from `base.js`) which provides common functionality for browser automation using Playwright, including session management (loading/saving cookies and local storage). API-based services might not need `BaseAIService` but should follow a similar structural pattern for consistency.

All services are registered in the `serviceRegistry` object within `server.js`, which allows the system to dynamically load and manage them.

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
    Call `super()` with a unique service name and a session name. The service name is for logging and identification, and the session name is used as the filename for storing session state (e.g., cookies).
    ```javascript
    constructor(name, url) { // name & url are passed from serviceRegistry in server.js
      super('MyNewService', 'my_new_service_session');
      this.url = url; // Store if needed for navigation
      console.log(`MyNewService initialized with URL: ${this.url}`);
      // Initialize API clients or other configurations if necessary
    }
    ```
*   **For API-Based Services:**
    The constructor should initialize any API clients or configurations. It typically won't call `super()`.
    ```javascript
    constructor() {
      // const apiKey = process.env.MY_NEW_SERVICE_API_KEY;
      // if (!apiKey) throw new Error('MY_NEW_SERVICE_API_KEY is not set');
      // this.apiClient = new SomeApiClient({ apiKey });
      console.log('MyNewService (API Client) initialized.');
    }
    ```

### 3. Implement Core Logic

*   Define asynchronous methods specific to the service's functionality. Examples:
    *   `async generateContent(prompt)`
    *   `async postMedia(mediaPath, details)`
    *   `async performTask(params)`
    *   `async login(username, password)`
*   These methods should encapsulate the interactions with the target service.
*   **For UI-Based Services:** Use `this.page` (provided by `BaseAIService` after `initialize()`) for Playwright interactions:
    ```javascript
    async getSomeData() {
      if (!this.page) throw new Error('Page not initialized. Call initialize() first.');
      await this.page.goto(this.url);
      await this.page.fill('#searchBox', 'some query');
      await this.page.click('#searchButton');
      await this.page.waitForSelector('#results');
      return this.page.textContent('#results');
    }
    ```
*   **Error Handling:** Implement robust error handling within your service methods. Catch errors from API calls or Playwright interactions and log them or throw custom errors as appropriate.

### 4. `initialize()` and `close()` Methods

*   **If extending `BaseAIService`:**
    *   The base `initialize()` method launches Playwright, sets up `this.browser`, `this.context`, and `this.page`, and attempts to load a saved session.
    *   The base `close()` method saves the current session and closes the browser.
    *   If your service needs additional setup (e.g., specific login steps not covered by session cookies, navigating to a default page) or cleanup, you can override these methods. **Remember to call `await super.initialize();` or `await super.close();`** if you want the base functionality.
    ```javascript
    async initialize() {
      await super.initialize(); // Launches browser, loads session
      console.log('MyNewService specific initialization...');
      // Example: Navigate to a dashboard or perform a health check
      // await this.page.goto(`${this.url}/dashboard`);
    }

    async close() {
      console.log('MyNewService specific cleanup...');
      // Example: Explicit logout if needed
      // if (this.page) {
      //   await this.page.click('#logoutButton');
      // }
      await super.close(); // Saves session, closes browser
    }
    ```
*   **If not extending `BaseAIService` (API-based):**
    *   An `async initialize()` method can be useful for checking API connectivity or fetching initial configuration.
    *   A `async close()` method can be used to release any resources (e.g., close persistent connections).
    These methods will be called by `server.js` if they exist.

### 5. Register in `serviceRegistry` (`server.js`)

*   Add an entry for your new service in the `serviceRegistry` object in `server.js`:
    ```javascript
    const serviceRegistry = {
      // ... other services
      myNewService: {
        module: './services/my_new_service', // Path to your service file
        url: 'https://my.service.url/api_or_homepage', // Optional: URL for the service
        type: 'ui' // or 'api' - informational for now
      },
    };
    ```
    *   `module`: The relative path to your service's JS file from the project root.
    *   `url`: (Optional) A base URL for the service, passed to the constructor.
    *   `type`: (Optional, informational) Can be 'ui' for browser-based services or 'api' for direct API clients.

### 6. Credentials Management

*   If your service requires API keys, login credentials, or other sensitive information, add corresponding entries to `.env.example`.
    ```
    # My New Service
    MY_NEW_SERVICE_API_KEY=your_api_key_here
    MY_NEW_SERVICE_USERNAME=user@example.com
    MY_NEW_SERVICE_PASSWORD=secretpassword
    ```
*   Developers will then copy `.env.example` to `.env` and fill in the actual values.
*   **Security Note:** For UI automation services, storing passwords directly in `.env` is generally discouraged for production or shared environments. Prefer an interactive login during the first run in a headed browser. `BaseAIService` will save the session (cookies, local storage), allowing subsequent runs to be headless and authenticated. If non-interactive login is essential, ensure access to the `.env` file is strictly controlled.

### 7. Testing

*   **Standalone Testing:** It's often helpful to write a small test script to run your service methods independently.
    ```javascript
    // Example: test_my_new_service.js (run with node)
    // const MyNewService = require('./services/my_new_service');
    // (async () => {
    //   const service = new MyNewService('Test', 'http://test.com');
    //   await service.initialize();
    //   const data = await service.getSomeData();
    //   console.log(data);
    //   await service.close();
    // })();
    ```
*   **Integration Testing:** Test your service as part of the full MCP workflow defined in `server.js` by making requests to the `/mcp/viral-content` endpoint or by direct invocation if you're modifying `server.js`.
*   **Debugging UI Automation:** If you're working on a UI-based service and need to see what the browser is doing, you can temporarily set `headless: false` in the `chromium.launch()` options within `BaseAIService.initialize()` (in `base.js`).

## API-Based vs. UI-Based Services

*   **UI-Based Services:**
    *   Extend `BaseAIService`.
    *   Use `this.page` (Playwright Page object) for interactions.
    *   Rely on `BaseAIService` for browser launch, session loading/saving, and closing.
    *   Examples: Claude, Gemini (if UI-driven), Runway, Canva, social media platforms.
*   **API-Based Services:**
    *   Typically do not extend `BaseAIService`.
    *   Use an HTTP client (like `axios`) or a specific SDK to interact with the service's API.
    *   Manage their own client setup and API key handling.
    *   Example: Groq.

## Service Method Conventions

While not strictly enforced, try to follow consistent naming for common actions where it makes sense:

*   `generate...`: For content generation (e.g., `generateScript`, `generateImage`).
*   `post...`: For publishing content (e.g., `postContent`, `postVideo`).
*   `get...`: For retrieving data.
*   `compile...`: For combining assets.

This helps in understanding the role of different methods when looking at `server.js` or other services.

---

By following these guidelines, you can effectively integrate new services and expand the capabilities of the MCP Viral Content System. Remember to keep your service modular and well-documented.
