// Stub for TikTokService
class TikTokService {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    console.log(`Stub ${this.name} service initialized for URL: ${this.url}`);
  }

  async initialize() {
    console.log(`Stub ${this.name} service: initialize method called.`);
  }

  async postContent(contentDetails) {
    console.log(`Stub ${this.name} service: postContent called with contentDetails:`, contentDetails);
    return { postId: 'tiktok_dummy_123', status: 'posted' };
  }

  async close() {
    console.log(`Stub ${this.name} service: close method called.`);
  }
}

module.exports = TikTokService;
