const { BaseAIService } = require('../base');

class YouTubeService extends BaseAIService {
  constructor(name, url) { // name and url are passed by server.js
    super('YouTubeService', 'youtube_session'); // Use specific names for BaseAIService
    // 'name' and 'url' from server.js are not strictly needed by BaseAIService itself
    // but good to acknowledge they are passed. We use fixed names for session handling.
    console.log(`Stub ${this.serviceName} service initialized for URL: ${url}`); // Optional: keep similar logging
  }

  async postContent({ video, title, description, tags }) {
    await this.page.goto('https://studio.youtube.com', { waitUntil: 'networkidle' });
    
    // Click upload button
    await this.page.click('button[aria-label="Create"]');
    await this.page.click('text="Upload video"');
    
    // Upload file
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.page.click('div#upload-prompt-box')
    ]);
    await fileChooser.setFiles(video);
    
    // Fill details
    await this.page.fill('input#textbox', title);
    await this.page.fill('textarea#description', description);
    await this.page.fill('input#tags', tags.join(','));
    
    // Set as public
    await this.page.click('button[name="PUBLIC"]');
    
    // Publish
    await this.page.click('button#done-button');
    
    // Get video URL
    await this.page.waitForSelector('a.ytcp-video-info');
    return await this.page.$eval('a.ytcp-video-info', a => a.href);
  }
}

module.exports = YouTubeService;