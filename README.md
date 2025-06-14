# MCP-Web-UI-Client
MCP Client for Browser Automation of AI's Web UI

How the System Works
The enhanced MCP system follows this workflow:

Diagram
Code
graph TD
    A[User Request] --> B(Groq Strategy Engine)
    B --> C[Content Creation]
    C --> D[Media Generation]
    D --> E[Content Assembly]
    E --> F[Google Drive Storage]
    F --> G[Multi-Platform Distribution]
    G --> H[Analytics & Optimization]
Strategy Creation: Groq AI develops viral content strategy

Content Generation: Claude/Gemini create scripts

Media Production:

RunwayML for video

ElevenLabs for audio

Stable Diffusion for images

Assembly: Canva compiles all elements

Storage: Google Drive archiving

Distribution: Automated posting to all platforms

Optimization: Analytics feedback loop

Deployment Options
Option 1: Render Backend Deployment (Recommended)
Pros:

Fully managed service

Persistent storage

Easy scaling

Free tier available
Frontend: Static React app (if needed)

Backend: Node.js on Render

Storage: Google Drive + MongoDB

Monitoring: Sentry + Logtail

To add new services:

Create service module in services/

Implement required methods

Add to serviceRegistry

Add credentials to environment variables

Test with headless: false mode

Deploy through GitHub

This architecture gives you:

100% free tier capability (Render free + Google Drive)

Complete content automation pipeline

Easy extensibility for new services

Ethical content generation safeguards

Viral optimization psychology engine.

## Running Locally

To run the application locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Copy the `.env.example` file to a new file named `.env`:
    ```bash
    cp .env.example .env
    ```
    Update the `.env` file with your specific configurations for:
    *   `PORT` (optional, defaults to 3000)
    *   `LOG_LEVEL` (optional, defaults to 'info')
    *   `GOOGLE_CREDENTIALS` (JSON string or leave empty to use `credentials.json`)
    *   `GROQ_API_KEY`
    *   `SUPABASE_URL`
    *   `SUPABASE_ANON_KEY`
    *   `TELEGRAM_BOT_TOKEN`
    *   `TELEGRAM_ADMIN_CHAT_ID`
    *   `MERCHANT_SOLANA_WALLET`
    *   `SOLANA_WEBHOOK_SECRET`
    *   Any other service-specific credentials as needed.

4.  **Start the server:**
    ```bash
    npm start
    ```
    The server should now be running on the configured port.

## Running Tests

This project uses Jest for testing. To run the tests:

1.  Ensure you have installed all dependencies:
    ```bash
    npm install
    ```

2.  Run the test script:
    ```bash
    npm test
    ```
    This will execute all test files located in the `tests` directory.
