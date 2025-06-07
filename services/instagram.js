// Stub for InstagramService
const { BaseAIService } = require('../base'); // Required for extending
// const path = require('path'); // No longer needed here
// const fs = require('fs').promises; // No longer needed here

class InstagramService extends BaseAIService {
  constructor(name, url) {
    super('InstagramService', 'instagram_session'); // Call BaseAIService constructor
    this.url = url; // Expected to be https://instagram.com by server.js
    console.log(`[${this.serviceName}] service initialized for URL: ${this.url}`);
  }

  // initialize() is inherited from BaseAIService
  // close() is inherited from BaseAIService

  async postContent({ video: videoPath, caption, tags }) {
    console.log(`[${this.serviceName}] Starting Instagram post for video: ${videoPath}`);
    if (!this.page) {
      throw new Error("Playwright page is not initialized. Call initialize() first.");
    }
    if (!videoPath) {
        throw new Error("videoPath is required to upload to Instagram.");
    }

    try {
      await this.page.goto('https://www.instagram.com/', { waitUntil: 'networkidle', timeout: 60000 });
      console.log(`[${this.serviceName}] Navigated to Instagram homepage.`);

      // Conceptual: Handle Login & Initial Popups (e.g., "Save login info?", "Turn on notifications?")
      // These popups can block further interaction. BaseAIService session should handle login.
      // Example of dismissing popups (selectors are guesses and need verification):
      const notNowSelectors = ['button:has-text("Not Now")', 'button:has-text("Cancel")']; // Add other common texts
      for (const selector of notNowSelectors) {
        // Use a short timeout as these popups may or may not appear
        try {
          const button = await this.page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
          if (button) {
            await button.click();
            console.log(`[${this.serviceName}] Clicked "${await button.innerText()}" on a popup.`);
            await this.page.waitForTimeout(1000); // Wait for popup to dismiss
          }
        } catch (e) {
          // console.log(`[${this.serviceName}] Popup button for selector "${selector}" not found or not visible.`);
        }
      }

      // Click Create Post Button
      // Instagram's "New post" button often uses an SVG icon. A more robust selector might target its parent.
      const createButtonSelector = 'div[role="button"] svg[aria-label="New post"]'; // More specific
      // Alternative: 'a[href="/create/select/"]' if such a link exists and is stable
      console.log(`[${this.serviceName}] Waiting for Create Post button: ${createButtonSelector}`);
      await this.page.waitForSelector(createButtonSelector, { timeout: 30000 });
      await this.page.click(createButtonSelector);
      console.log(`[${this.serviceName}] Clicked 'Create Post' button.`);

      // Upload Video File - Modal appears
      const selectFromComputerButton = 'button:has-text("Select from computer")';
      console.log(`[${this.serviceName}] Waiting for 'Select from computer' button: ${selectFromComputerButton}`);
      await this.page.waitForSelector(selectFromComputerButton, { timeout: 20000 });

      const [fileChooser] = await Promise.all([
        this.page.waitForEvent('filechooser', {timeout:10000}),
        this.page.click(selectFromComputerButton)
      ]);
      await fileChooser.setFiles(videoPath);
      console.log(`[${this.serviceName}] File ${videoPath} selected for upload.`);

      // Handle Crop/Aspect Ratio Screen & Filters Screen by clicking "Next"
      // Instagram's multi-step modal. These selectors target "Next" within a dialog.
      const nextButtonInDialogSelector = 'div[role="dialog"] button:has-text("Next")';

      console.log(`[${this.serviceName}] Waiting for 'Next' button (Crop/Aspect screen - up to 3 mins for processing)...`);
      await this.page.waitForSelector(nextButtonInDialogSelector, { timeout: 180000 });
      await this.page.click(nextButtonInDialogSelector);
      console.log(`[${this.serviceName}] Clicked 'Next' (Crop/Aspect screen).`);

      console.log(`[${this.serviceName}] Waiting for 'Next' button (Filters/Edit screen)...`);
      await this.page.waitForSelector(nextButtonInDialogSelector, { timeout: 20000 }); // Shorter timeout for next screen
      await this.page.click(nextButtonInDialogSelector);
      console.log(`[${this.serviceName}] Clicked 'Next' (Filters/Edit screen). Navigated to Caption screen.`);

      // Fill Caption
      const captionTextareaSelector = 'textarea[aria-label="Write a caption..."]';
      console.log(`[${this.serviceName}] Waiting for caption textarea: ${captionTextareaSelector}`);
      await this.page.waitForSelector(captionTextareaSelector, { timeout: 20000 });

      const fullCaption = `${caption}\n\n${tags.map(t => `#${t.trim()}`).join(' ')}`; // Add some newlines for better formatting
      await this.page.fill(captionTextareaSelector, fullCaption);
      console.log(`[${this.serviceName}] Caption and tags filled.`);

      // Click Share Button
      const shareButtonSelector = 'div[role="dialog"] button:has-text("Share")'; // Share button in the dialog
      console.log(`[${this.serviceName}] Waiting for Share button: ${shareButtonSelector}`);
      await this.page.waitForSelector(shareButtonSelector, { timeout: 10000 });
      await this.page.click(shareButtonSelector);
      console.log(`[${this.serviceName}] Share button clicked.`);

      // Wait for Post Confirmation (Conceptual)
      // This is tricky. Instagram might show "Your post has been shared." or simply close the modal.
      // Waiting for the modal to disappear or for a specific success message.
      console.log(`[${this.serviceName}] Waiting for post confirmation (up to 1 min)...`);
      // Option 1: Wait for a specific text to appear (fragile due to text changes/localization)
      // Option 2: Wait for the post modal to disappear.
      // For now, let's assume success if no error after a short delay, or look for a known success text.
      await this.page.waitForFunction(() =>
        document.body.innerText.includes("Your post has been shared.") ||
        document.body.innerText.includes("Post shared") ||
        !document.querySelector('div[role="dialog"] button:has-text("Share")'), // Modal closed
        { timeout: 60000 }
      );
      console.log(`[${this.serviceName}] Video posted successfully (confirmation received or modal closed).`);

      // Return Post Information
      const postId = `instagram_post_${Date.now()}`;
      console.log(`[${this.serviceName}] Post successful. Generated postId: ${postId}`);
      return { postId: postId, postLink: null }; // postLink is null

    } catch (error) {
      console.error(`[${this.serviceName}] Error in 'postContent': ${error.message}`, error.stack);
      await this.takeScreenshotOnError('postContent');
      throw error;
    }
  }
}

module.exports = InstagramService;
