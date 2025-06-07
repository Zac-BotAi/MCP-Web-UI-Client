# API Documentation for MCP Viral System

This document outlines the available API endpoints, their usage, request/response formats, and authentication requirements.

## Base URL
All API endpoints are relative to the server's base URL (e.g., `http://localhost:3000` if running locally).

## Authentication
Most endpoints are protected and require a JSON Web Token (JWT) obtained from the `/api/auth/login` or `/api/auth/signup` endpoint. The JWT must be included in the `Authorization` header as a Bearer token:
`Authorization: Bearer <your_jwt_here>`

---

## Authentication Endpoints (`/api/auth`)

### 1. User Signup
*   **Method:** `POST`
*   **Path:** `/api/auth/signup`
*   **Description:** Registers a new user. Also creates a corresponding profile in the `public.users` table.
*   **Protected:** No
*   **Request Body:**
    ```json
    {
      "email": "user@example.com",
      "password": "yourstrongpassword",
      "fullName": "Test User (Optional)",
      "avatarUrl": "http://example.com/avatar.png (Optional)",
      "solanaWalletAddress": "YourSolanaWalletAddress (Optional)"
    }
    ```
*   **Successful Response (201):**
    ```json
    {
      "message": "Signup successful. Please check your email for confirmation if enabled.",
      "user": { /* Supabase user object (id, email, created_at, etc.) */ },
      "session": { /* Supabase session object, may be null if email confirmation is pending. Contains access_token (JWT) and refresh_token. */ },
      "publicProfile": { /* User profile data from public.users table, or null if creation failed */ }
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Missing email/password, invalid email format, weak password, user already exists, etc. (Error message from Supabase).
    *   `500 Internal Server Error`: Server-side issue during signup process.
    *   `503 Service Unavailable`: If Supabase client is not initialized.

### 2. User Login
*   **Method:** `POST`
*   **Path:** `/api/auth/login`
*   **Description:** Logs in an existing user.
*   **Protected:** No
*   **Request Body:**
    ```json
    {
      "email": "user@example.com",
      "password": "yourstrongpassword"
    }
    ```
*   **Successful Response (200):**
    ```json
    {
      "user": { /* Supabase user object */ },
      "session": { /* Supabase session object, including access_token (JWT) and refresh_token */ }
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Missing email/password, invalid credentials (Error message from Supabase).
    *   `500 Internal Server Error`: Server-side issue.
    *   `503 Service Unavailable`: If Supabase client is not initialized.

### 3. User Logout
*   **Method:** `POST`
*   **Path:** `/api/auth/logout`
*   **Description:** Logs out the current user. This invalidates server-side refresh tokens for the user. The client is responsible for discarding the JWT (access token).
*   **Protected:** Yes (Requires valid JWT via `authMiddleware`)
*   **Request Body:** None
*   **Successful Response (200):**
    ```json
    { "message": "Logout successful. Please discard your token." }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Error during Supabase signout.
    *   `401 Unauthorized`: Invalid or missing JWT.
    *   `500 Internal Server Error`: Server-side issue.
    *   `503 Service Unavailable`: If Supabase client is not initialized.

### 4. Get Authenticated User
*   **Method:** `GET`
*   **Path:** `/api/auth/user`
*   **Description:** Retrieves the authenticated user's details, including their Supabase auth user data and their profile from the `public.users` table.
*   **Protected:** Yes (Requires valid JWT via `authMiddleware`)
*   **Request Body:** None
*   **Successful Response (200):**
    ```json
    {
      "id": "uuid",
      "email": "user@example.com",
      // ... other Supabase auth user fields ...
      "publicProfile": {
        "id": "uuid", // Same as auth user id
        "email": "user@example.com", // Denormalized
        "full_name": "Test User",
        "avatar_url": "http://example.com/avatar.png",
        "subscription_status": "free",
        "subscription_expires_at": null,
        "solana_wallet_address": "YourSolanaWalletAddress",
        "created_at": "timestamp",
        "updated_at": "timestamp"
        // ... or null if public profile doesn't exist
      }
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`: Invalid or missing JWT.
    *   `500 Internal Server Error`: Server-side issue (e.g., fetching public profile).
    *   `503 Service Unavailable`: If Supabase client is not initialized.

---

## User Preferences Endpoints (`/api/user`)

### 1. Set User Service Preferences
*   **Method:** `POST`
*   **Path:** `/api/user/preferences`
*   **Description:** Sets or updates the user's preferred services for different categories (e.g., image generation, voice generation). This operation is atomic per `service_type`; existing preferences for a given user and `service_type` are replaced.
*   **Protected:** Yes (Requires valid JWT via `authMiddleware`)
*   **Request Body:**
    ```json
    {
      "preferences": [
        { "service_type": "image_generation", "service_id": "runway", "priority": 0 },
        { "service_type": "image_generation", "service_id": "some_other_image_gen", "priority": 1 },
        { "service_type": "voice_generation", "service_id": "elevenlabs", "priority": 0 }
      ]
    }
    ```
    *   `service_type`: A string identifying the category of service (e.g., "image_generation").
    *   `service_id`: The unique identifier for the service (must match a key in `serviceRegistry` in `server.js`).
    *   `priority`: Integer, lower numbers indicate higher preference. Must be unique per `user_id` and `service_type`.
*   **Successful Response (200):**
    ```json
    { "message": "Preferences updated successfully." }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Invalid input format.
    *   `401 Unauthorized`: Invalid or missing JWT.
    *   `500 Internal Server Error`: Database error during update.
    *   `503 Service Unavailable`: If Supabase client is not initialized.

### 2. Get User Service Preferences
*   **Method:** `GET`
*   **Path:** `/api/user/preferences`
*   **Description:** Retrieves all service preferences for the authenticated user, ordered by `service_type` and then `priority`.
*   **Protected:** Yes (Requires valid JWT via `authMiddleware`)
*   **Request Body:** None
*   **Successful Response (200):** An array of preference objects.
    ```json
    [
      { "id": 1, "user_id": "user-uuid", "service_type": "image_generation", "service_id": "runway", "priority": 0, "created_at": "2023-01-01T00:00:00Z" },
      { "id": 3, "user_id": "user-uuid", "service_type": "image_generation", "service_id": "some_other_image_gen", "priority": 1, "created_at": "2023-01-01T00:00:00Z" },
      { "id": 2, "user_id": "user-uuid", "service_type": "voice_generation", "service_id": "elevenlabs", "priority": 0, "created_at": "2023-01-01T00:00:00Z" }
    ]
    ```
*   **Error Responses:**
    *   `401 Unauthorized`: Invalid or missing JWT.
    *   `500 Internal Server Error`: Database error.
    *   `503 Service Unavailable`: If Supabase client is not initialized.

---

## Payment Endpoints (`/api/payments`) (Conceptual)

These endpoints are part of a conceptual design for a Solana-based subscription system. Full functionality requires client-side Solana Pay integration and a webhook listener for payment confirmations.

### 1. Initiate Subscription Payment
*   **Method:** `POST`
*   **Path:** `/api/payments/initiate_subscription`
*   **Description:** Initiates a payment process for a chosen subscription plan. Creates a pending payment record in the database.
*   **Protected:** Yes (Requires valid JWT via `authMiddleware`)
*   **Request Body:**
    ```json
    {
      "planId": "monthly", // String: e.g., "monthly", "annual"
      "solanaPriceUSD": 200.50 // Number: Current price of 1 SOL in USD, provided by client for server to calculate SOL amount for USD-denominated plan.
    }
    ```
*   **Successful Response (200):** Returns parameters for the client to construct a Solana Pay transaction.
    ```json
    {
      "message": "Payment initiation successful. Proceed with Solana Pay.",
      "paymentReference": "MCP-userShortId-timestamp", // Unique reference ID for this transaction attempt
      "recipient": "YOUR_MERCHANT_SOLANA_WALLET_FROM_ENV", // Merchant's Solana wallet address
      "amount": "0.245000000", // Example: Calculated SOL amount for the plan
      "splToken": null, // String (Optional): Address of SPL token (e.g., USDC) if paying in SPL token. Null for native SOL.
      "label": "Monthly Unlimited", // String: Plan name or description for the transaction
      "memo": "MCP-userShortId-timestamp" // String: Reference ID embedded in memo for on-chain tracking
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Invalid `planId`.
    *   `401 Unauthorized`: Invalid or missing JWT.
    *   `500 Internal Server Error`: Failed to create payment record or other server issue.
    *   `503 Service Unavailable`: If Supabase client is not initialized.

### 2. Solana Payment Confirmation Webhook
*   **Method:** `POST`
*   **Path:** `/api/payments/webhook/solana_confirmation`
*   **Description:** **(For server-to-server use by a payment processor or blockchain listener ONLY)**. Confirms a Solana payment, updates the corresponding payment record, and activates the user's subscription.
*   **Protected:** Yes (Requires a secret `X-Webhook-Secret` header matching the `SOLANA_WEBHOOK_SECRET` environment variable).
*   **Request Body (Example from a hypothetical processor):**
    ```json
    {
      "reference": "MCP-userShortId-timestamp", // The paymentReference generated by initiate_subscription
      "transactionSignature": "solana_transaction_signature_here", // The actual on-chain transaction signature
      "status": "confirmed", // String: e.g., "confirmed", "finalized" (from processor)
      "amountPaid": "0.245" // String or Number: Amount of SOL paid (verified by processor)
      // ... other data from processor ...
    }
    ```
*   **Successful Response (200):**
    ```json
    { "message": "Webhook processed successfully. Subscription updated." }
    ```
    (Also `200 OK` with message "Webhook received, payment awaiting final confirmation from processor." if `solanaStatus` is not yet "confirmed" or "finalized")
*   **Error Responses:**
    *   `403 Forbidden`: Invalid or missing `X-Webhook-Secret`.
    *   `404 Not Found`: Payment record for the given `reference` not found or not in a pending state.
    *   `500 Internal Server Error`: Database update failed or other server issue.
    *   `503 Service Unavailable`: If Supabase client is not initialized.

---

## Service Usage Endpoint (`/api/service`)

### 1. Get Service Usage Information
*   **Method:** `GET`
*   **Path:** `/api/service/:serviceId/usage`
*   **Description:** Fetches usage information (e.g., remaining credits/tokens) for a specified UI automation service, if supported by that service's module. This typically involves launching a browser, logging into the service, and scraping the data. The service instance is created and closed per request.
*   **Protected:** Yes (Requires valid JWT via `authMiddleware`)
*   **Path Parameters:**
    *   `serviceId`: The ID of the service as defined in `serviceRegistry` (e.g., `elevenlabs`, `runway`).
*   **Request Body:** None
*   **Successful Response (200):**
    ```json
    {
      "serviceId": "elevenlabs",
      "usageData": {
        "rawUsageData": "1500 / 10000 characters remaining" // Example data from ElevenLabs
      }
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`: Invalid or missing JWT.
    *   `404 Not Found`: If `serviceId` is not found in `serviceRegistry` or is misconfigured.
    *   `501 Not Implemented`: If the specified service does not support the `fetchServiceUsage` method.
    *   `500 Internal Server Error`: Error during Playwright operation or other server issue.
    *   `503 Service Unavailable`: If Supabase client is not initialized.

---
## Main Content Creation Endpoint (`/mcp`)

### 1. Create Viral Content
*   **Method:** `POST`
*   **Path:** `/mcp/viral-content`
*   **Description:** The main endpoint to trigger the automated viral content creation pipeline using various AI services. Uses user's preferred services if set, otherwise defaults.
*   **Protected:** Yes (Requires valid JWT via `authMiddleware`)
*   **Request Body (JSON-RPC like structure):**
    ```json
    {
      "id": "client_generated_unique_request_id", // This ID is echoed in the response
      "method": "create_viral_content",
      "params": {
        "topic": "The future of AI in content creation"
      }
    }
    ```
*   **Successful Response (200):**
    ```json
    {
      "jsonrpc": "2.0",
      "result": {
        "contentId": "uuid_generated_for_this_content_workflow",
        "strategy": { /* ... content strategy object ... */ },
        "driveLink": "https://drive.google.com/...", // Link to the final video on Google Drive
        "posts": {
          "youtube": { "postId": "youtube_video_id_or_url", "videoLink": "..." },
          "tiktok": { "postId": "tiktok_post_id_timestamp", "postLink": null },
          "instagram": { "postId": "instagram_post_id_timestamp", "postLink": null }
        }
      },
      "id": "client_generated_unique_request_id" // Echoed from request
    }
    ```
*   **Error Responses:**
    *   `400 Bad Request`: Invalid request format or missing parameters (e.g., `topic`).
    *   `401 Unauthorized`: Invalid or missing JWT.
    *   `500 Internal Server Error`: An error occurred during the content creation pipeline (e.g., a service failed, compilation error). Details logged on server, admin notified for critical errors.
    *   `503 Service Unavailable`: If Supabase client (needed for user preferences) is not initialized.
---
