const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const TEMP_DIR = path.join(__dirname, '../data/temp');

class MediaDownloader {
  constructor() {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  /**
   * Downloads file from URL and saves it to the temp folder
   */
  async download(url, filename) {
    const filePath = path.join(TEMP_DIR, filename);
    try {
      logger.debug(`Downloading: ${url.substring(0, 80)}...`);
      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          const size = fs.statSync(filePath).size;
          logger.debug(`Downloaded: ${filename} (${(size / 1024).toFixed(1)} KB)`);
          resolve(filePath);
        });
        writer.on('error', reject);
      });
    } catch (err) {
      logger.error(`Download failed for ${filename}: ${err.message}`);
      return null;
    }
  }

  /**
   * Downloads multiple images
   */
  async downloadImages(imageUrls, postId) {
    const paths = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const ext = this.getExtension(imageUrls[i]);
      const filename = `${postId}_img${i + 1}.${ext}`;
      const filePath = await this.download(imageUrls[i], filename);
      if (filePath) paths.push(filePath);
    }
    return paths;
  }

  /**
   * Video download
   */
  async downloadVideo(videoUrl, postId) {
    const directUrl = await this.resolveDirectVideoUrl(videoUrl);
    let ext = this.getExtension(directUrl);
    if (!['mp4', 'mov'].includes(ext)) {
      ext = 'mp4'; // Force mp4 for Facebook video streaming sources
    }
    const filename = `${postId}_video.${ext}`;
    return await this.download(directUrl, filename);
  }

  /**
   * Resolves a public Facebook video URL to a direct downloadable MP4 link by scraping the page HTML.
   * Prioritizes HD quality and falls back to SD.
   */
  async resolveDirectVideoUrl(url) {
    if (url.includes('.fbcdn.net') || url.includes('.mp4')) {
      return url; // Already a direct CDN link
    }

    if (url.includes('facebook.com')) {
      try {
        logger.debug(`Scraping FB video page to resolve direct MP4 link: ${url}`);
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 15000
        });
        const html = response.data;

        // Try HD quality URL first
        let videoMatch = html.match(/"playable_url_quality_hd":"(https:[^"]+)"/);
        if (!videoMatch) {
          // Fallback to SD quality URL
          videoMatch = html.match(/"playable_url":"(https:[^"]+)"/);
        }

        if (videoMatch && videoMatch[1]) {
          const directUrl = videoMatch[1].replace(/\\/g, '');
          logger.debug(`Successfully resolved direct FB video link: ${directUrl.substring(0, 80)}...`);
          return directUrl;
        } else {
          logger.warn(`Could not find playable_url in FB HTML source`);
        }
      } catch (err) {
        logger.error(`Error resolving FB video url: ${err.message}`);
      }
    }

    return url; // Fallback to original URL
  }

  /**
   * Extracts file extension from URL
   */
  getExtension(url) {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname).replace('.', '');
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov'].includes(ext)) {
        return ext;
      }
    } catch {}
    return 'jpg';
  }

  /**
   * Deletes temp files (after posting)
   */
  cleanup(filePaths) {
    for (const fp of filePaths) {
      try {
        if (fp && fs.existsSync(fp)) {
          fs.unlinkSync(fp);
          logger.debug(`Cleaned up: ${path.basename(fp)}`);
        }
      } catch (err) {
        logger.warn(`Cleanup failed for ${fp}: ${err.message}`);
      }
    }
  }

  /**
   * Cleans up old temp files (older than 24 hours)
   */
  cleanupOldFiles() {
    try {
      const files = fs.readdirSync(TEMP_DIR);
      const now = Date.now();
      let cleaned = 0;
      for (const file of files) {
        const fp = path.join(TEMP_DIR, file);
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
          fs.unlinkSync(fp);
          cleaned++;
        }
      }
      if (cleaned > 0) logger.info(`Cleaned up ${cleaned} old temp files`);
    } catch (err) {
      logger.warn(`Old file cleanup error: ${err.message}`);
    }
  }
}

module.exports = new MediaDownloader();
