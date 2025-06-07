// Stub for ElevenLabsService
class ElevenLabsService {
  constructor(name, url) {
    this.name = name;
    this.url = url;
    console.log(`Stub ${this.name} service initialized for URL: ${this.url}`);
  }

  async initialize() {
    console.log(`Stub ${this.name} service: initialize method called.`);
  }

  async generateAudio(scriptSegment) {
    console.log(`Stub ${this.name} service: generateAudio called with scriptSegment:`, scriptSegment);
    return { path: 'dummy_audio.mp3', duration: 10 };
  }

  async close() {
    console.log(`Stub ${this.name} service: close method called.`);
  }
}

module.exports = ElevenLabsService;
