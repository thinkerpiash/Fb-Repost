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
    const ext = this.getExtension(videoUrl) || 'mp4';
    const filename = `${postId}_video.${ext}`;
    return await this.download(videoUrl, filename);
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
