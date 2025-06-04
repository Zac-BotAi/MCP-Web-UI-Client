// services/tiktok.js
class TikTokService {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    this.apiKey = process.env.TIKTOK_API_KEY;
    console.log(`TikTokService stub initialized for: ${this.name} (URL: ${this.url})`);
    if (this.apiKey) {
      console.log('TikTokService: API key found (length: ' + this.apiKey.length + ')');
    } else {
      console.warn('TikTokService: TIKTOK_API_KEY environment variable not set.');
    }
  }

  async postContent(contentDetails) {
    console.log('STUB: TikTokService.postContent called with contentDetails:', contentDetails);
    return Promise.resolve({ postId: 'tiktok_stub_post_id_123' });
  }
}
module.exports = TikTokService;
