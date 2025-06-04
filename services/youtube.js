// services/youtube.js
class YouTubeService {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    this.apiKey = process.env.YOUTUBE_API_KEY; // YouTube often uses OAuth 2.0
    console.log(`YouTubeService stub initialized for: ${this.name} (URL: ${this.url})`);
    if (this.apiKey) {
      console.log('YouTubeService: API key found (length: ' + this.apiKey.length + '). Note: YouTube APIs typically use OAuth 2.0 for most operations.');
    } else {
      console.warn('YouTubeService: YOUTUBE_API_KEY environment variable not set. Note: OAuth 2.0 is often used.');
    }
  }

  async postContent({ video, title, description, tags }) {
    console.log(`STUB: YouTubeService.postContent called for ${this.name}`);
    console.log('   Video:', video);
    console.log('   Title:', title);
    console.log('   Description:', description);
    console.log('   Tags:', tags);
    return Promise.resolve({ postId: 'youtube_stub_post_id_123', videoUrl: `https://youtube.com/stub/${title.replace(/\s+/g, '_')}` });
  }
}

module.exports = YouTubeService;