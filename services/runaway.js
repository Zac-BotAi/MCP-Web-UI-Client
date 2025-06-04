const { BaseAIService } = require('../base');

class RunwayService extends BaseAIService {
  async generateVideo(strategy) {
    await this.page.goto('https://app.runwayml.com/video-tools', { waitUntil: 'networkidle' });
    
    // Enter text-to-video prompt
    await this.page.fill('textarea.prompt-input', strategy.visualPrompt);
    await this.page.click('button.generate-video');
    
    // Wait for generation
    await this.page.waitForSelector('.generated-video', { timeout: 180000 });
    
    // Download video
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.click('button.download-video')
    ]);
    
    const fileName = `video-${Date.now()}.mp4`;
    const savePath = path.join(TEMP_DIR, fileName);
    await download.saveAs(savePath);
    
    return { path: savePath, fileName };
  }
}

module.exports = RunwayService;