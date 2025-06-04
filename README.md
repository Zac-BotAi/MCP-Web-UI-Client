# MCP Viral Content System

The MCP (Master Control Program) Viral Content System is a Node.js application designed to automate the creation and distribution of viral content. It leverages various AI services for content strategy, media generation, and assembly, and is designed for multi-platform distribution.

## System Overview

The system operates through a defined workflow initiated by a user request:

1.  **Topic Input:** The user provides a topic for content generation via an API endpoint.
2.  **Psychology-Driven Strategy:** The internal `PsychologyEngine` generates viral input elements (hooks, music styles, emotional triggers).
3.  **Content Strategy Generation:** These inputs, along with the user's topic, are fed to **Groq** (via `services/groq.js`) to develop a comprehensive content strategy.
4.  **Media Generation (Stubbed Services):**
    *   **Script:** Claude (`services/claude.js`)
    *   **Image & Video Elements:** Runway (`services/runaway.js`)
    *   **Audio:** ElevenLabs (`services/elevenlabs.js`)
5.  **Content Assembly (Stubbed Service):**
    *   **Final Video:** Canva (`services/canva.js`) compiles the generated assets.
6.  **Storage:** The final content is uploaded to a dedicated, configurable folder in **Google Drive**.
7.  **Social Distribution (Stubbed Services):**
    *   Content is prepared for posting to YouTube (`services/youtube.js`), TikTok (`services/tiktok.js`), and Instagram (`services/instagram.js`).

**Important Note on Service Implementation:** Currently, Groq is the only fully integrated external service. All other services (Claude, Runway, ElevenLabs, Canva, YouTube, TikTok, Instagram, and New_Service) are implemented as **stubs**. These stubs log their operations and return placeholder data, allowing the end-to-end workflow to be tested and demonstrated.

## Features

*   Automated content creation pipeline from topic to (stubbed) distribution.
*   Psychology-driven content strategy using Groq.
*   Integration with Google Drive for storing generated content in a configurable application-specific folder.
*   Modular service architecture, allowing for new services to be added.
*   Environment variable-based configuration for API keys and settings.
*   Stubbed implementation of most AI and social media services for development and testing without requiring all API accesses.

## Setup Instructions

### Prerequisites

*   **Node.js:** (LTS version recommended, e.g., 18.x or 20.x)
*   **npm:** (Usually comes with Node.js)
*   **Google Cloud Account:** To set up Google Drive API access.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Google Drive Setup

This application uses the Google Drive API to store generated content.

1.  **Create Google Cloud Project & Enable Drive API:**
    *   Go to the [Google Cloud Console](https://console.cloud.google.com/).
    *   Create a new project (or use an existing one).
    *   Enable the "Google Drive API" for your project.
2.  **Create OAuth 2.0 Credentials:**
    *   In the Google Cloud Console, navigate to "APIs & Services" > "Credentials".
    *   Click "+ CREATE CREDENTIALS" and choose "OAuth client ID".
    *   Configure the OAuth consent screen if you haven't already. For application type, if running locally for testing, you might use "Desktop app". If deploying, "Web application" would be more appropriate with authorized redirect URIs.
    *   After creating the OAuth client ID, download the JSON file.
3.  **Place Credentials File:**
    *   Rename the downloaded JSON file to `credentials.json`.
    *   Place this file in the root directory of the project.
    *   This file is listed in `.gitignore` and should **not** be committed to source control.

### Environment Variables

Create a `.env` file in the root of the project (this file is gitignored). Populate it with the necessary API keys and settings:

```env
# Port for the server to listen on
PORT=3000

# Google Drive folder name (optional, defaults to "MCP Content Uploads")
GOOGLE_DRIVE_APP_FOLDER_NAME="My Viral Videos"

# Groq API Key (Required for core functionality)
GROQ_API_KEY="your_groq_api_key"

# API Keys for STUBBED services (for future implementation)
CLAUDE_API_KEY="optional_claude_key_for_future"
GEMINI_API_KEY="optional_gemini_key_for_future"
ELEVENLABS_API_KEY="optional_elevenlabs_key_for_future"
RUNWAY_API_KEY="optional_runway_key_for_future"
CANVA_API_KEY="optional_canva_key_for_future"
YOUTUBE_API_KEY="optional_youtube_key_for_future" # Note: YouTube often uses OAuth 2.0 for API access
TIKTOK_API_KEY="optional_tiktok_key_for_future"
INSTAGRAM_API_KEY="optional_instagram_key_for_future" # Note: Instagram often uses Access Tokens
NEW_SERVICE_API_KEY="optional_new_service_key_for_future"
```
**Note:** While environment variables are listed for all services, only `GROQ_API_KEY` is actively used by a non-stubbed service. The others are placeholders for when these services are fully implemented.

## Running the Application

1.  **Ensure `.env` file is configured** with at least `GROQ_API_KEY`.
2.  **Start the server:**
    ```bash
    npm start
    ```
    (This assumes a `start` script in `package.json`, e.g., `"start": "node server.js"`)
    The server will typically run on `http://localhost:3000` (or the port specified in `PORT`).

## API Usage

The primary endpoint for generating content is:

*   **POST** `/mcp/viral-content`

This endpoint expects a JSON request body with a topic for content creation.

**Request Body Example:**
```json
{
  "id": "user_request_123",
  "method": "create_viral_content",
  "params": {
    "topic": "The Future of Renewable Energy"
  }
}
```

**Example cURL Command:**
```bash
curl -X POST -H "Content-Type: application/json" \
-d '{
  "id": "curl_test_001",
  "method": "create_viral_content",
  "params": {
    "topic": "The Impact of AI on Art"
  }
}' \
http://localhost:3000/mcp/viral-content
```

**Expected Response Structure (Success):**
A JSON object containing details of the generated strategy, links to created assets (stubbed for now), and social media post information (stubbed).
```json
{
  "jsonrpc": "2.0",
  "result": {
    "contentId": "generated_uuid",
    "strategy": { /* ... strategy object from Groq ... */ },
    "driveLink": "google_drive_link_to_video.mp4",
    "posts": {
      "youtube": { "postId": "youtube_stub_post_id_123", "videoUrl": "https://youtube.com/stub/..." },
      "tiktok": { "postId": "tiktok_stub_post_id_123" },
      "instagram": { "postId": "instagram_stub_post_id_123" }
    }
  },
  "id": "curl_test_001"
}
```
In case of an error, the server responds with a JSON-RPC error object.

## Extending the System

To add a new service:

1.  **Create the Service File:** Add a new JavaScript file in the `services/` directory (e.g., `services/myNewAIService.js`).
    *   Follow the structure of existing stubs (e.g., `services/new_service.js` which serves as a good template).
    *   Implement the constructor to handle API keys from environment variables.
    *   Implement the required methods for your service.
2.  **Register the Service:** Add your new service to the `serviceRegistry` object in `server.js`.
    ```javascript
    const serviceRegistry = {
      // ... other services
      myNewService: { module: './services/myNewAIService.js', url: 'https://api.mynewservice.com' },
    };
    ```
3.  **Add Environment Variables:** Document and add any new environment variables (like `MY_NEW_AI_SERVICE_API_KEY`) to your `.env` file and update this README.
4.  **Integrate into Workflow:** Modify `server.js` (e.g., in `ViralContentSystem.createViralContent`) to call your new service's methods.
5.  **Test thoroughly.**

This system is designed to be modular and extensible. Remember to handle errors gracefully within your new service and in the calling code.
