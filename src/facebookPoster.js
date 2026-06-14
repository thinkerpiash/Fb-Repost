const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const logger = require('./logger');

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

class FacebookPoster {
  constructor(pageId, accessToken) {
    this.pageId = pageId;
    this.accessToken = accessToken;
  }

  /**
   * Post text only
   */
  async postText(caption) {
    try {
      const response = await axios.post(
        `${GRAPH_API_BASE}/${this.pageId}/feed`,
        {
          message: caption,
          access_token: this.accessToken
        }
      );
      logger.info(`Text post published: ${response.data.id}`);
      return response.data.id;
    } catch (err) {
      this._logApiError('postText', err);
      return null;
    }
  }

  /**
   * Post a single image with caption
   */
  async postSingleImage(imagePath, caption) {
    try {
      const form = new FormData();
      form.append('source', fs.createReadStream(imagePath));
      form.append('message', caption);
      form.append('access_token', this.accessToken);

      const response = await axios.post(
        `${GRAPH_API_BASE}/${this.pageId}/photos`,
        form,
        { headers: form.getHeaders(), timeout: 60000 }
      );
      logger.info(`Single photo post published: ${response.data.id}`);
      return response.data.id;
    } catch (err) {
      this._logApiError('postSingleImage', err);
      return null;
    }
  }

  /**
   * Post multiple images (album)
   */
  async postMultipleImages(imagePaths, caption) {
    if (imagePaths.length === 1) {
      return await this.postSingleImage(imagePaths[0], caption);
    }

    try {
      // Step 1: Upload each image as unpublished
      const photoIds = [];
      for (const imgPath of imagePaths) {
        const form = new FormData();
        form.append('source', fs.createReadStream(imgPath));
        form.append('published', 'false');
        form.append('access_token', this.accessToken);

        const res = await axios.post(
          `${GRAPH_API_BASE}/${this.pageId}/photos`,
          form,
          { headers: form.getHeaders(), timeout: 60000 }
        );
        photoIds.push({ media_fbid: res.data.id });
        logger.debug(`Uploaded photo: ${res.data.id}`);
      }

      // Step 2: Post to feed as an album
      const response = await axios.post(
        `${GRAPH_API_BASE}/${this.pageId}/feed`,
        {
          message: caption,
          attached_media: photoIds,
          access_token: this.accessToken
        }
      );
      logger.info(`Album post published (${imagePaths.length} photos): ${response.data.id}`);
      return response.data.id;
    } catch (err) {
      this._logApiError('postMultipleImages', err);
      return null;
    }
  }

  /**
   * Post a video
   * Note: Chunked upload is required for large videos
   */
  async postVideo(videoPath, caption) {
    try {
      const fileSize = fs.statSync(videoPath).size;
      logger.info(`Uploading video: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

      if (fileSize > 100 * 1024 * 1024) {
        // If more than 100MB, use chunked upload
        return await this._chunkedVideoUpload(videoPath, caption, fileSize);
      }

      // Normal upload
      const form = new FormData();
      form.append('source', fs.createReadStream(videoPath));
      form.append('description', caption);
      form.append('access_token', this.accessToken);

      const response = await axios.post(
        `${GRAPH_API_BASE}/${this.pageId}/videos`,
        form,
        { headers: form.getHeaders(), timeout: 300000 }
      );
      logger.info(`Video post published: ${response.data.id}`);
      return response.data.id;
    } catch (err) {
      this._logApiError('postVideo', err);
      return null;
    }
  }

  /**
   * Chunked video upload (for videos larger than 100MB)
   */
  async _chunkedVideoUpload(videoPath, caption, fileSize) {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

    // Start upload session
    const startRes = await axios.post(
      `${GRAPH_API_BASE}/${this.pageId}/videos`,
      {
        upload_phase: 'start',
        file_size: fileSize,
        access_token: this.accessToken
      }
    );
    const { upload_session_id, video_id, start_offset, end_offset } = startRes.data;
    logger.info(`Chunked upload started. Session: ${upload_session_id}`);

    // Upload chunks
    let currentStart = parseInt(start_offset);
    let currentEnd = parseInt(end_offset);
    const fileHandle = fs.openSync(videoPath, 'r');

    while (currentStart < fileSize) {
      const chunkSize = currentEnd - currentStart;
      const buffer = Buffer.alloc(chunkSize);
      fs.readSync(fileHandle, buffer, 0, chunkSize, currentStart);

      const form = new FormData();
      form.append('upload_phase', 'transfer');
      form.append('upload_session_id', upload_session_id);
      form.append('start_offset', currentStart.toString());
      form.append('video_file_chunk', buffer, {
        filename: 'chunk',
        contentType: 'application/octet-stream'
      });
      form.append('access_token', this.accessToken);

      const transferRes = await axios.post(
        `${GRAPH_API_BASE}/${this.pageId}/videos`,
        form,
        { headers: form.getHeaders(), timeout: 120000 }
      );

      currentStart = parseInt(transferRes.data.start_offset);
      currentEnd = parseInt(transferRes.data.end_offset);
      const progress = ((currentStart / fileSize) * 100).toFixed(1);
      logger.info(`Upload progress: ${progress}%`);
    }

    fs.closeSync(fileHandle);

    // Finish upload
    const finishRes = await axios.post(
      `${GRAPH_API_BASE}/${this.pageId}/videos`,
      {
        upload_phase: 'finish',
        upload_session_id,
        description: caption,
        access_token: this.accessToken
      }
    );
    logger.info(`Chunked video upload complete: ${video_id}`);
    return video_id;
  }

  /**
   * Post link fallback with thumbnail and caption
   * Used when video download fails
   */
  async postVideoLinkFallback(permalinkUrl, caption) {
    try {
      const response = await axios.post(
        `${GRAPH_API_BASE}/${this.pageId}/feed`,
        {
          message: caption,
          link: permalinkUrl,
          access_token: this.accessToken
        }
      );
      logger.info(`Video link fallback posted: ${response.data.id}`);
      return response.data.id;
    } catch (err) {
      this._logApiError('postVideoLinkFallback', err);
      return null;
    }
  }

  _logApiError(method, err) {
    if (err.response) {
      const fbErr = err.response.data?.error;
      logger.error(`[${method}] FB API Error ${err.response.status}: ${fbErr?.message || JSON.stringify(err.response.data)}`);
      if (fbErr?.code === 190) logger.error('⚠️  Access token expired! Please refresh.');
      if (fbErr?.code === 200) logger.error('⚠️  Missing permissions on destination page.');
    } else {
      logger.error(`[${method}] Error: ${err.message}`);
    }
  }
}

module.exports = FacebookPoster;
