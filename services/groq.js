const { Groq } = require("groq-sdk");

class GroqService {
  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('GroqService: GROQ_API_KEY environment variable not set. GroqService may not function.');
    }
    this.groq = new Groq({ apiKey });
  }

  async generateStrategy(topic, psychologyElements) {
    const prompt = `Develop a viral content strategy about "${topic}" incorporating the following elements:
    - Specific Hook: "${psychologyElements.hook}"
    - Music Style: "${psychologyElements.music}"
    - Emotional Triggers: ${psychologyElements.emotionalTriggers.join(', ')}
    Also include:
    - Visual style (cinematic, meme, documentary, etc.)
    - Target audience personas
    - Viral hashtags (5-7)
    - Attention-grabbing title
    - 2-sentence captivating description
    - Short platform-specific captions
    Ensure the overall strategy creatively uses the provided hook, music style, and emotional triggers.
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
