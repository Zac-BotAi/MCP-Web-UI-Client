const { Groq } = require("groq-sdk");
const retry = require('async-retry');

class GroqService {
  constructor() {
    if (!process.env.GROQ_API_KEY) {
      console.warn("GROQ_API_KEY environment variable is not set. GroqService will not be able to function.");
      // Optionally, throw an error here to prevent initialization if the key is critical
      // throw new Error("GROQ_API_KEY is missing.");
    }
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
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
          console.log(`Retrying Groq strategy generation for ${contextIdentifier} (Attempt ${attemptNumber})`);
        }

        const response = await this.groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "mixtral-8x7b-32768",
          response_format: { type: "json_object" }
        });

        if (!response || !response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
          console.error(`Malformed response from Groq for ${contextIdentifier} on attempt ${attemptNumber}:`, response);
          throw new Error("Malformed response from Groq API"); // This will be retried
        }

        const messageContent = response.choices[0].message.content;

        try {
          return JSON.parse(messageContent);
        } catch (jsonError) {
          console.error(`Failed to parse JSON response from Groq for ${contextIdentifier}:`, messageContent, jsonError);
          // Bail on JSON parsing errors as retrying the same content won't help
          bail(new Error(`Failed to parse JSON response from Groq: ${jsonError.message}`));
          return null; // Should not be reached due to bail
        }

      } catch (error) {
        console.error(`Groq API call attempt ${attemptNumber} for ${contextIdentifier} failed: ${error.message}`);

        // Handle specific Groq SDK errors or HTTP status codes
        // The Groq SDK might wrap HTTP errors or have specific error types.
        // This example assumes errors might have a 'status' property for HTTP codes.
        // Adjust based on actual error objects thrown by the Groq SDK.
        if (error.status === 401 || error.status === 403) {
          console.error(`Authentication/Authorization error with Groq API (${error.status}). Bailing out.`);
          bail(error);
          return null; // Should not be reached
        } else if (error.status === 429) {
          console.warn(`Rate limit hit for Groq API. Retrying...`);
          throw error; // Re-throw to let async-retry handle backoff
        } else if (error.message === "Malformed response from Groq API") {
            throw error; // Re-throw to retry malformed responses
        }
        // For other errors (e.g., 5xx, network issues), re-throw to allow retries
        throw error;
      }
    }, {
      retries: 3,
      factor: 2,
      minTimeout: 1000, // 1 second
      maxTimeout: 10000, // 10 seconds
      onRetry: (error, attemptNumber) => {
        console.log(`Preparing for Groq retry attempt ${attemptNumber} for ${contextIdentifier} due to: ${error.message}`);
      }
    }).catch(finalError => {
      console.error(`Failed to generate Groq strategy for ${contextIdentifier} after multiple retries:`, finalError);
      // Re-throw the final error so the caller can handle it
      throw new Error(`Failed to generate Groq strategy for ${contextIdentifier} after multiple retries: ${finalError.message}`);
    });
  }
}

module.exports = GroqService;
