const { Groq } = require("groq-sdk");

class GroqService {
  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async generateStrategy(topic) {
    const prompt = `Develop a viral content strategy about "${topic}" including:
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
    
    const response = await this.groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "mixtral-8x7b-32768",
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  }
}

module.exports = GroqService;
