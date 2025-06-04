// services/canva.js
class CanvaService {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    this.apiKey = process.env.CANVA_API_KEY;
    console.log(`CanvaService stub initialized for: ${this.name} (URL: ${this.url})`);
    if (this.apiKey) {
      console.log('CanvaService: API key found (length: ' + this.apiKey.length + ')');
    } else {
      console.warn('CanvaService: CANVA_API_KEY environment variable not set.');
    }
  }

  async compileVideo(assets) {
    console.log('STUB: CanvaService.compileVideo called with assets:', assets);
    return Promise.resolve({ path: 'path/to/stub/video.mp4' });
  }
}
module.exports = CanvaService;
