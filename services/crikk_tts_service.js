// services/crikk_tts_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'crikk_tts_downloads');

class CrikkTTSService extends BaseAIService {
  constructor(name = 'CrikkTTSService', url = 'https://crikk.com/text-to-speech/') {
    super(name, 'crikk_tts_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    if (this.page.url() !== this.url && !this.page.url().startsWith(this.url)) {
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
         console.log(`[${this.serviceName}] Already on target URL or a subpage: ${this.page.url()}`);
    }
    // Conceptual: HandleCookieBannerOrModals();
    // Conceptual: HandleLogin(); // Crikk seems to be free without prominent login for basic TTS
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateAudio(scriptSegment, language = null, voice = null) { // Added language/voice params
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Generating audio for script (first 100 chars): "${scriptSegment.substring(0,100)}...", Lang: ${language || 'default'}, Voice: ${voice || 'default'}`);

    try {
      // Ensure on correct page if needed
      if (!this.page.url().startsWith(this.url)) {
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Text Input ---
      const textInputSelector = 'textarea#text'; // Based on Crikk's typical ID for text area
      await this.page.waitForSelector(textInputSelector, { timeout: 20000 });
      await this.page.fill(textInputSelector, scriptSegment);
      console.log(`[${this.serviceName}] Script segment filled.`);

      // --- Language Selection (Conceptual) ---
      if (language) {
        console.log(`[${this.serviceName}] Attempting to set language to: ${language}`);
        // const languageSelectSelector = 'select#languages'; // Common for <select>
        // if (await this.page.isVisible(languageSelectSelector)) {
        //    await this.page.selectOption(languageSelectSelector, { label: language });
        //    console.log(`[${this.serviceName}] Language set to ${language}.`);
        // } else {
        //    console.warn(`[${this.serviceName}] Language select element not found.`);
        // }
        console.warn(`[${this.serviceName}] Language selection ('${language}') is conceptual and needs UI-specific implementation for Crikk.`);
      }

      // --- Voice Selection (Conceptual) ---
      if (voice) {
        console.log(`[${this.serviceName}] Attempting to set voice to: ${voice}`);
        // const voiceSelectSelector = 'select#voices'; // Common for <select>
        // if (await this.page.isVisible(voiceSelectSelector)) {
        //    await this.page.selectOption(voiceSelectSelector, { label: voice });
        //    console.log(`[${this.serviceName}] Voice set to ${voice}.`);
        // } else {
        //    console.warn(`[${this.serviceName}] Voice select element not found.`);
        // }
        console.warn(`[${this.serviceName}] Voice selection ('${voice}') is conceptual and needs UI-specific implementation for Crikk.`);
      }

      // --- Trigger Generation & Download ---
      // Crikk typically has a "Download as MP3" button that might also trigger generation.
      const downloadMp3ButtonSelector = 'button#download'; // Common ID on Crikk

      await this.page.waitForSelector(downloadMp3ButtonSelector, { timeout: 10000 });
      if (!(await this.page.isEnabled(downloadMp3ButtonSelector))) {
          console.warn(`[${this.serviceName}] Download/Generate button ('${downloadMp3ButtonSelector}') disabled. Waiting (up to 20s for processing)...`);
          await this.page.waitForFunction(selector => {
              const btn = document.querySelector(selector); return btn && !btn.disabled;
          }, downloadMp3ButtonSelector, {timeout: 20000}).catch(() => {
              throw new Error(`Download/Generate button ('${downloadMp3ButtonSelector}') remained disabled.`);
          });
      }

      console.log(`[${this.serviceName}] Clicking download/generate button: ${downloadMp3ButtonSelector}`);
      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      await this.page.click(downloadMp3ButtonSelector);
      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `crikk_tts_audio_${Date.now()}.mp3`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, suggestedFilename);
      await download.saveAs(filePath);

      console.log(`[${this.serviceName}] Audio downloaded to: ${filePath}`);
      return { path: filePath, duration: null };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in generateAudio: ${error.message}`, error.stack);
      await this.takeScreenshotOnError('generateAudio');
      throw error;
    }
  }

  async fetchServiceUsage() {
    // Crikk TTS is generally free, possibly with ads or rate limits not visible as 'tokens'.
    console.log(`[${this.serviceName}] Fetching service usage information (typically N/A for Crikk TTS).`);
    return { rawUsageData: 'Free (Usage not typically tracked via account tokens)' };
  }

  async close() {
    if (!this.isInitialized) {
      return;
    }
    await super.close();
    this.isInitialized = false;
    console.log(`[${this.serviceName}] Closed and de-initialized.`);
  }
}

module.exports = { CrikkTTSService };
