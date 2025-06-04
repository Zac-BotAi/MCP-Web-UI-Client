// services/gemini.js
class GeminiService {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    this.apiKey = process.env.GEMINI_API_KEY;
    console.log(`GeminiService stub initialized for: ${this.name} (URL: ${this.url})`);
    if (this.apiKey) {
      console.log('GeminiService: API key found (length: ' + this.apiKey.length + ')');
    } else {
      console.warn('GeminiService: GEMINI_API_KEY environment variable not set.');
    }
  }

  async generateScript(strategy) {
    console.log('STUB: GeminiService.generateScript called with strategy:', strategy);
    return Promise.resolve({ script: 'This is a stub script from Gemini.' });
  }
}
module.exports = GeminiService;
