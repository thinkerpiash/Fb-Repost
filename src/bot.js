const FacebookFetcher = require('./facebookFetcher');
const FacebookPoster = require('./facebookPoster');
const mediaDownloader = require('./mediaDownloader');
const stateManager = require('./stateManager');
const logger = require('./logger');

class RepostBot {
  constructor() {
    this.fetcher = new FacebookFetcher(process.env.SOURCE_PAGE_ID);
    this.poster = new FacebookPoster(
      process.env.DEST_PAGE_ID,
      process.env.DEST_PAGE_ACCESS_TOKEN
    );
    this.isRunning = false;
    this.stats = { total: 0, success: 0, skipped: 0, failed: 0 };
  }

  /**
   * Main post processing loop
   */
  async run() {
    if (this.isRunning) {
      logger.warn('Previous run still in progress, skipping this cycle');
      return;
    }
    this.isRunning = true;

    try {
      logger.info('=== Starting repost cycle ===');
      const limit = parseInt(process.env.POSTS_PER_FETCH) || 10;
      const posts = await this.fetcher.fetchRecentPosts(limit);

      if (posts.length === 0) {
        logger.info('No posts found from source page');
        return;
      }

      // Reverse to process the oldest post first
      const orderedPosts = [...posts].reverse();

      for (const post of orderedPosts) {
        await this.processPost(post);
        // Rate limiting: প্রতি পোষ্টের পরে ৩ সেকেন্ড বিরতি
        await this.sleep(3000);
      }

      logger.info(`=== Cycle complete | Total: ${this.stats.total} | Posted: ${this.stats.success} | Skipped: ${this.stats.skipped} | Failed: ${this.stats.failed} ===`);

    } catch (err) {
      logger.error(`Fatal error in run cycle: ${err.message}`);
    } finally {
      this.isRunning = false;
      mediaDownloader.cleanupOldFiles();
    }
  }

  /**
   * Processes a single post
   */
  async processPost(post) {
    this.stats.total++;
    const postId = post.id;

    // Check if already posted
    if (stateManager.hasPosted(postId)) {
      this.stats.skipped++;
      logger.debug(`Skipped (already posted): ${postId}`);
      return;
    }

    const postType = this.fetcher.detectPostType(post);
    const caption = this.fetcher.extractCaption(post);
    const mediaUrls = this.fetcher.extractMediaUrls(post);

    logger.info(`Processing [${postType}] post: ${postId} | Caption: "${caption.substring(0, 60)}..."`);

    let newPostId = null;
    const downloadedFiles = [];

    try {
      switch (postType) {
        case 'text':
          if (caption) {
            newPostId = await this.poster.postText(caption);
          } else {
            logger.warn(`Skipping empty text post: ${postId}`);
            this.stats.skipped++;
            return;
          }
          break;

        case 'photo': {
          const imagePaths = await mediaDownloader.downloadImages(mediaUrls.images, postId);
          downloadedFiles.push(...imagePaths);

          if (imagePaths.length > 0) {
            newPostId = await this.poster.postMultipleImages(imagePaths, caption);
          } else {
            // If download fails, post caption/text only
            logger.warn(`Image download failed, posting text only for: ${postId}`);
            newPostId = await this.poster.postText(caption);
          }
          break;
        }

        case 'video': {
          if (mediaUrls.videoUrl) {
            const videoPath = await mediaDownloader.downloadVideo(mediaUrls.videoUrl, postId);

            if (videoPath) {
              downloadedFiles.push(videoPath);
              newPostId = await this.poster.postVideo(videoPath, caption);
            } else {
              // If video download fails, use link fallback
              logger.warn(`Video download failed, trying link fallback for: ${postId}`);
              newPostId = await this.poster.postVideoLinkFallback(post.permalink_url, caption);
            }
          } else {
            logger.warn(`No video URL found for: ${postId}`);
            if (caption) newPostId = await this.poster.postText(caption);
          }
          break;
        }

        case 'share': {
          // For shared posts, caption + link
          const shareCaption = caption || post.story || '';
          if (shareCaption) {
            newPostId = await this.poster.postText(shareCaption);
          }
          break;
        }

        default:
          logger.warn(`Unknown post type "${postType}" for: ${postId}`);
          if (caption) newPostId = await this.poster.postText(caption);
      }

      // If successful, mark in state
      if (newPostId) {
        stateManager.markPosted(postId);
        this.stats.success++;
        logger.info(`✅ Reposted successfully: ${postId} → ${newPostId}`);
      } else {
        this.stats.failed++;
        logger.error(`❌ Failed to repost: ${postId}`);
      }

    } catch (err) {
      this.stats.failed++;
      logger.error(`Error processing post ${postId}: ${err.message}`);
    } finally {
      // Clean up temp files
      mediaDownloader.cleanup(downloadedFiles);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return { ...this.stats, trackedPosts: stateManager.getCount() };
  }
}

module.exports = RepostBot;
