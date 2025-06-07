// Stub for CanvaService
class CanvaService {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    console.log(`Stub ${this.name} service initialized for URL: ${this.url}`);
  }

  async initialize() {
    console.log(`Stub ${this.name} service: initialize method called.`);
  }

  async compileVideo(assets) {
    console.log(`Stub ${this.name} service: compileVideo called with assets:`, assets);
    return { path: 'dummy_final_video.mp4', duration: 30 };
  }

  async close() {
    console.log(`Stub ${this.name} service: close method called.`);
  }
}

module.exports = CanvaService;
