const { Groq } = require("groq-sdk");

class GroqService {
  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    if (!process.env.GROQ_API_KEY) {
        console.warn("GROQ_API_KEY environment variable not set. GroqService may not function.");
    }
  }

  async generateStrategy(topic) {
    const aiDisclosure = "This content was generated with the assistance of AI tools and is intended for entertainment and informational purposes. Viewer discretion is advised.";

    const prompt = `Develop a viral content strategy about "${topic}" including:
    - Psychological hooks for maximum engagement
    - Trending music style recommendations
    - Visual style (cinematic, meme, documentary, etc.)
    - Target audience personas
    - Viral hashtags (5-7, as an array of strings)
    - Attention-grabbing title (string)
    - 2-sentence captivating description (string)
    - Short platform-specific captions (object with keys like 'tiktok', 'youtube', 'instagram', string values)
    - A visual prompt for image/video generation (string)
    - A viral music prompt or recommendation (string)
    - A short script segment or key talking points (string)
    
    Respond in JSON format only. Ensure all fields are populated.
    The JSON structure should be: {
      "title": "",
      "description": "",
      "hashtags": [],
      "visualPrompt": "",
      "viralMusicPrompt": "",
      "scriptSegment": "",
      "captions": {
        "youtube": "",
        "tiktok": "",
        "instagram": ""
      },
      "audience": "",
      "aiDisclosure": "${aiDisclosure}" // Added this field
    }`;
    
    try {
      const response = await this.groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "mixtral-8x7b-32768", // Ensure this model is available and supports JSON object response format
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
          throw new Error("Groq API returned an empty message content.");
      }

      let parsedContent = JSON.parse(content);

      // Ensure captions object exists and has defaults
      parsedContent.captions = parsedContent.captions || {};
      parsedContent.captions.youtube = parsedContent.captions.youtube || parsedContent.description; // Fallback for youtube caption
      parsedContent.captions.tiktok = parsedContent.captions.tiktok || `Check this out: ${parsedContent.title}`;   // Fallback for tiktok caption
      parsedContent.captions.instagram = parsedContent.captions.instagram || `Loving this vibe: ${parsedContent.title}`; // Fallback for instagram caption

      // Ensure aiDisclosure is present
      parsedContent.aiDisclosure = parsedContent.aiDisclosure || aiDisclosure;
      parsedContent.description = `${parsedContent.description}

${aiDisclosure}`;


      return parsedContent;

    } catch (error) {
      console.error("Error generating strategy with Groq:", error.message);
      // Fallback strategy in case of Groq API error
      return {
        title: `Exploring ${topic}`,
        description: `An interesting look into ${topic}. Dive deep into the various aspects and discover something new.

${aiDisclosure}`,
        hashtags: ["ai", topic.toLowerCase().replace(/\s+/g, ''), "generatedcontent"],
        visualPrompt: `A compelling visual representing ${topic}`,
        viralMusicPrompt: "Upbeat and trending electronic music",
        scriptSegment: `Let's talk about ${topic}. It's a fascinating subject...`,
        captions: {
          youtube: `A deep dive into ${topic}.

${aiDisclosure}`,
          tiktok: `Ever wondered about ${topic}? 🤔 #fyp

${aiDisclosure}`,
          instagram: `Exploring the world of ${topic}. ✨

${aiDisclosure}`
        },
        audience: "General audience interested in new technologies and discussions.",
        aiDisclosure: aiDisclosure
      };
    }
  }
}

module.exports = GroqService;
