const { Groq } = require("groq-sdk");
const retry = require('async-retry');
const config = require('../../config'); // Added config require
const logger = require('../../lib/logger'); // Added logger require

class GroqService {
  constructor() {
    if (!config.groqApiKey) {
      logger.warn("Groq API key is not set in config. GroqService will not be able to function.");
    }
    this.groq = new Groq({
      apiKey: config.groqApiKey,
      timeout: config.timeouts.groqMs, // Added timeout from config
    });
  }

  async generateStrategy(topic, urlContent) {
    let prompt;
    if (urlContent) {
      prompt = `Analyze the following text and develop a viral content strategy based on it:
      "${urlContent}"

      The strategy should include:
      - Psychological hooks for maximum engagement
      - Trending music style recommendations
      - Visual style (cinematic, meme, documentary, etc.)
      - Target audience personas
      - Viral hashtags (5-7)
      - Attention-grabbing title
      - 2-sentence captivating description
      - Short platform-specific captions

      Respond in JSON format: {
        title: "",
        description: "",
        hashtags: [],
        visualPrompt: "",
        viralMusicPrompt: "",
        scriptSegment: "",
        caption: "",
        audience: ""
      }`;
    } else {
      prompt = `Develop a viral content strategy about "${topic}" including:
      - Psychological hooks for maximum engagement
      - Trending music style recommendations
      - Visual style (cinematic, meme, documentary, etc.)
      - Target audience personas
      - Viral hashtags (5-7)
      - Attention-grabbing title
      - 2-sentence captivating description
      - Short platform-specific captions

      Respond in JSON format: {
        title: "",
        description: "",
        hashtags: [],
        visualPrompt: "",
        viralMusicPrompt: "",
        scriptSegment: "",
        caption: "",
        audience: ""
      }`;
    }

    const contextIdentifier = urlContent ? `URL content (snippet: ${urlContent.substring(0, 50)}...)` : `topic: "${topic}"`;

    return retry(async (bail, attemptNumber) => {
      try {
        if (attemptNumber > 1) {
          logger.info({ contextIdentifier, attemptNumber }, `Retrying Groq strategy generation`);
        }

        const response = await this.groq.chat.completions.create(
          {
            messages: [{ role: "user", content: prompt }],
            model: "mixtral-8x7b-32768",
            response_format: { type: "json_object" }
          }
          // Per-request timeout can also be set here using an AbortSignal,
          // but client-level timeout is generally cleaner if all requests should use it.
          // Example: { signal: AbortSignal.timeout(config.timeouts.groqMs) }
        );

        if (!response || !response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
          logger.error({ contextIdentifier, attemptNumber, responseContent: response }, `Malformed response from Groq`);
          throw new Error("Malformed response from Groq API");
        }

        const messageContent = response.choices[0].message.content;

        try {
          return JSON.parse(messageContent);
        } catch (jsonError) {
          logger.error({ err: jsonError, contextIdentifier, messageContent }, `Failed to parse JSON response from Groq`);
          bail(new Error(`Failed to parse JSON response from Groq: ${jsonError.message}`));
          return null;
        }

      } catch (error) {
        // Log the error with context
        logger.warn({ err: error, contextIdentifier, attemptNumber, isBail: error.bail }, `Groq API call attempt failed`);

        if (error.status === 401 || error.status === 403) {
          logger.error({ err: error, contextIdentifier, status: error.status }, `Authentication/Authorization error with Groq API. Bailing out.`);
          bail(error);
          return null;
        } else if (error.message === "Malformed response from Groq API" && attemptNumber === (config.jobDefaultAttempts || 3)) {
           // If it's the last attempt for a malformed response, bail.
           logger.error({ err: error, contextIdentifier, attemptNumber }, `Malformed response from Groq on final attempt. Bailing out.`);
           bail(error);
           return null;
        }
        // For other errors (429, 5xx, network issues, or malformed not on last attempt), re-throw to allow retries
        throw error;
      }
    }, {
      retries: config.jobDefaultAttempts || 3, // Use config or default
      factor: 2,
      minTimeout: config.jobDefaultBackoffDelay || 1000, // Use config or default
      maxTimeout: 10000, // Keep a max timeout
      onRetry: (error, attemptNumber) => {
        logger.warn({ err: error, contextIdentifier, attemptNumber }, `Preparing for Groq retry attempt`);
      }
    }).catch(finalError => {
      logger.error({ err: finalError, contextIdentifier }, `Failed to generate Groq strategy after multiple retries`);
      throw new Error(`Failed to generate Groq strategy for ${contextIdentifier} after multiple retries: ${finalError.message}`);
    });
  }
}

module.exports = GroqService;
