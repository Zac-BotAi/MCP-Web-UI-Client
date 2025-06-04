// services/claude.js
class ClaudeService {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    this.apiKey = process.env.CLAUDE_API_KEY;
    console.log(`ClaudeService stub initialized for: ${this.name} (URL: ${this.url})`);
    if (this.apiKey) {
      console.log('ClaudeService: API key found (length: ' + this.apiKey.length + ')');
    } else {
      console.warn('ClaudeService: CLAUDE_API_KEY environment variable not set.');
    }
  }

  async generateScript(strategy) {
    console.log('STUB: ClaudeService.generateScript called with strategy:', strategy);
    return Promise.resolve({ script: 'This is a stub script from Claude.' });
  }

  // Add other methods if they are called in server.js, otherwise this is enough.
}
module.exports = ClaudeService;
